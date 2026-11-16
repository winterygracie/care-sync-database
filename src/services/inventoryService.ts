import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AppUser,
  InventoryBatch,
  InventoryItem,
  InventoryTransaction,
} from '../types/caresync';
import { attachAuditToBatch, attachAuditToTransaction, makeId } from './auditService';
import { attachNotificationToBatch } from './notificationService';

export async function createInventoryItem(
  actor: AppUser,
  input: {
    itemName: string;
    category: string;
    description: string;
    unit: string;
    minimumStockLevel: number;
  }
): Promise<string> {
  const itemId = makeId('item');
  const batch = writeBatch(db);

  batch.set(doc(db, 'inventory', itemId), {
    itemId,
    itemName: input.itemName.trim().slice(0, 150),
    category: input.category.trim().slice(0, 80),
    description: input.description.trim().slice(0, 500),
    unit: input.unit.trim().slice(0, 40),
    totalQuantity: 0,
    minimumStockLevel: Math.max(0, Number(input.minimumStockLevel) || 0),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'INVENTORY_ITEM_CREATE',
    affectedCollection: 'inventory',
    affectedRecordId: itemId,
    description: `Created inventory catalog item "${input.itemName.trim()}" (${input.unit}).`,
  });

  try {
    await batch.commit();
    return itemId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inventory/${itemId}`);
  }
}

export async function receiveInventoryBatch(
  actor: AppUser,
  input: {
    itemId: string;
    batchNumber: string;
    quantityReceived: number;
    expirationDate: string;
    dateReceived: string;
    reference?: string;
    reason?: string;
  }
): Promise<string> {
  const qty = Number(input.quantityReceived);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Quantity received must be greater than zero.');
  }

  const batchId = makeId('batch');
  const txId = makeId('tx');

  try {
    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, 'inventory', input.itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error('Inventory item not found.');
      }
      const item = itemSnap.data() as InventoryItem;
      const previousQuantity = Number(item.totalQuantity || 0);
      const newQuantity = previousQuantity + qty;

      tx.set(doc(db, 'inventoryBatches', batchId), {
        batchId,
        itemId: input.itemId,
        batchNumber: input.batchNumber.trim().slice(0, 80),
        quantityReceived: qty,
        remainingQuantity: qty,
        expirationDate: input.expirationDate,
        dateReceived: input.dateReceived,
        receivedBy: actor.uid,
        createdAt: serverTimestamp(),
      });

      tx.update(itemRef, {
        totalQuantity: newQuantity,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'inventoryTransactions', txId), {
        transactionId: txId,
        itemId: input.itemId,
        batchId,
        transactionType: 'received',
        quantity: qty,
        previousQuantity,
        newQuantity,
        reason: (input.reason || 'Supply delivery received').trim().slice(0, 300),
        reference: (input.reference || input.batchNumber).trim().slice(0, 150),
        performedBy: actor.uid,
        timestamp: serverTimestamp(),
      });

      attachAuditToTransaction(tx, {
        actor,
        actionType: 'INVENTORY_RECEIVE',
        affectedCollection: 'inventoryBatches',
        affectedRecordId: batchId,
        description: `Received ${qty} ${item.unit} of ${item.itemName} (Batch ${input.batchNumber}, Exp ${input.expirationDate}).`,
      });
    });

    return batchId;
  } catch (error) {
    if (error instanceof Error && !error.message.includes('permission')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `inventory/${input.itemId}`);
  }
}

/**
 * FEFO Dispensing Transaction:
 * 1. Loads all batches for itemId ordered by expirationDate ASC.
 * 2. Strictly excludes expired batches (expirationDate < todayStr) and empty batches.
 * 3. Validates sufficient eligible non-expired stock exists.
 * 4. Deducts from earliest-expiring eligible batches inside a Firestore runTransaction.
 * 5. Updates inventory totalQuantity, logs inventoryTransactions + auditLogs.
 * 6. Emits low_stock notification if newTotal <= minimumStockLevel.
 */
export async function dispenseInventoryFefo(
  actor: AppUser,
  input: {
    itemId: string;
    quantity: number;
    reason: string;
    reference?: string;
  }
): Promise<{
  dispensedFromBatches: { batchNumber: string; expirationDate: string; deducted: number }[];
  newTotal: number;
  triggeredLowStock: boolean;
}> {
  const requestedQty = Number(input.quantity);
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    throw new Error('Dispense quantity must be greater than zero.');
  }
  const cleanReason = input.reason.trim().slice(0, 300);
  if (!cleanReason) {
    throw new Error('Dispensing reason or clinical reference is required.');
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Query batches sorted by earliest expiration date (FEFO)
  let batchSnaps;
  try {
    const q = query(
      collection(db, 'inventoryBatches'),
      where('itemId', '==', input.itemId),
      orderBy('expirationDate', 'asc')
    );
    batchSnaps = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'inventoryBatches');
  }

  const candidateBatchIds = batchSnaps.docs
    .map((d) => d.data() as InventoryBatch)
    .filter((b) => b.remainingQuantity > 0 && b.expirationDate >= todayStr)
    .map((b) => b.batchId);

  if (candidateBatchIds.length === 0) {
    throw new Error('No eligible non-expired batches with available stock.');
  }

  const dispensedFromBatches: { batchNumber: string; expirationDate: string; deducted: number }[] = [];
  let newTotal = 0;
  let triggeredLowStock = false;
  let itemSnapshotForAlert: InventoryItem | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, 'inventory', input.itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error('Inventory item not found.');
      }
      const item = itemSnap.data() as InventoryItem;
      itemSnapshotForAlert = item;

      const freshBatches: InventoryBatch[] = [];
      for (const bId of candidateBatchIds) {
        const bSnap = await tx.get(doc(db, 'inventoryBatches', bId));
        if (bSnap.exists()) {
          const bData = bSnap.data() as InventoryBatch;
          if (bData.remainingQuantity > 0 && bData.expirationDate >= todayStr) {
            freshBatches.push(bData);
          }
        }
      }

      freshBatches.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));

      const totalEligible = freshBatches.reduce((sum, b) => sum + b.remainingQuantity, 0);
      if (totalEligible < requestedQty) {
        throw new Error(
          `Insufficient non-expired stock. Requested ${requestedQty} ${item.unit}, available non-expired stock is ${totalEligible} ${item.unit}.`
        );
      }

      let remainingToDispense = requestedQty;
      let runningTotal = Number(item.totalQuantity || 0);
      dispensedFromBatches.length = 0;

      for (const b of freshBatches) {
        if (remainingToDispense <= 0) break;
        const deduct = Math.min(b.remainingQuantity, remainingToDispense);
        const updatedBatchRemaining = b.remainingQuantity - deduct;
        const prevTotal = runningTotal;
        runningTotal = Math.max(0, runningTotal - deduct);

        tx.update(doc(db, 'inventoryBatches', b.batchId), {
          remainingQuantity: updatedBatchRemaining,
        });

        const txId = makeId('tx');
        tx.set(doc(db, 'inventoryTransactions', txId), {
          transactionId: txId,
          itemId: input.itemId,
          batchId: b.batchId,
          transactionType: 'dispensed',
          quantity: deduct,
          previousQuantity: prevTotal,
          newQuantity: runningTotal,
          reason: cleanReason,
          reference: (input.reference || '').trim().slice(0, 150),
          performedBy: actor.uid,
          timestamp: serverTimestamp(),
        });

        dispensedFromBatches.push({
          batchNumber: b.batchNumber,
          expirationDate: b.expirationDate,
          deducted: deduct,
        });

        remainingToDispense -= deduct;
      }

      newTotal = runningTotal;
      triggeredLowStock = newTotal <= item.minimumStockLevel;

      tx.update(itemRef, {
        totalQuantity: newTotal,
        updatedAt: serverTimestamp(),
      });

      attachAuditToTransaction(tx, {
        actor,
        actionType: 'INVENTORY_DISPENSE_FEFO',
        affectedCollection: 'inventory',
        affectedRecordId: input.itemId,
        description: `Dispensed ${requestedQty} ${item.unit} of ${item.itemName} using FEFO (${dispensedFromBatches
          .map((x) => `${x.batchNumber}: -${x.deducted}`)
          .join(', ')}).`,
      });
    });

    if (triggeredLowStock && itemSnapshotForAlert) {
      const item = itemSnapshotForAlert as InventoryItem;
      const alertBatch = writeBatch(db);
      attachNotificationToBatch(alertBatch, {
        title: `Low Stock Alert: ${item.itemName}`,
        message: `${item.itemName} dropped to ${newTotal} ${item.unit} (minimum level: ${item.minimumStockLevel} ${item.unit}). Replenishment recommended.`,
        notificationType: 'low_stock',
        recipientRoles: ['Administrative Clerk', 'Data Controller', 'Nurse'],
        relatedRecordId: item.itemId,
      });
      await alertBatch.commit();
    }

    return { dispensedFromBatches, newTotal, triggeredLowStock };
  } catch (error) {
    if (error instanceof Error && !error.message.includes('permission')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `inventory/${input.itemId}`);
  }
}

export async function adjustInventoryBatchStock(
  actor: AppUser,
  input: {
    itemId: string;
    batchId: string;
    newBatchQuantity: number;
    reason: string;
    reference?: string;
  }
): Promise<void> {
  const targetQty = Number(input.newBatchQuantity);
  if (!Number.isFinite(targetQty) || targetQty < 0) {
    throw new Error('Adjusted quantity cannot be negative.');
  }
  const cleanReason = input.reason.trim().slice(0, 300);
  if (!cleanReason) {
    throw new Error('Adjustment reason is required.');
  }

  let triggeredLowStock = false;
  let itemForAlert: InventoryItem | null = null;
  let finalTotal = 0;

  try {
    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, 'inventory', input.itemId);
      const batchRef = doc(db, 'inventoryBatches', input.batchId);
      const [itemSnap, batchSnap] = await Promise.all([tx.get(itemRef), tx.get(batchRef)]);

      if (!itemSnap.exists() || !batchSnap.exists()) {
        throw new Error('Inventory item or batch not found.');
      }

      const item = itemSnap.data() as InventoryItem;
      const batchDoc = batchSnap.data() as InventoryBatch;
      itemForAlert = item;

      if (targetQty > batchDoc.quantityReceived) {
        throw new Error(
          `Adjusted batch quantity (${targetQty}) cannot exceed original quantity received (${batchDoc.quantityReceived}).`
        );
      }

      const delta = targetQty - batchDoc.remainingQuantity;
      if (delta === 0) {
        throw new Error('No change in batch quantity.');
      }

      const prevTotal = Number(item.totalQuantity || 0);
      finalTotal = Math.max(0, prevTotal + delta);
      triggeredLowStock = finalTotal <= item.minimumStockLevel;

      tx.update(batchRef, { remainingQuantity: targetQty });
      tx.update(itemRef, {
        totalQuantity: finalTotal,
        updatedAt: serverTimestamp(),
      });

      const txId = makeId('tx');
      tx.set(doc(db, 'inventoryTransactions', txId), {
        transactionId: txId,
        itemId: input.itemId,
        batchId: input.batchId,
        transactionType: 'stock_adjustment',
        quantity: delta,
        previousQuantity: prevTotal,
        newQuantity: finalTotal,
        reason: cleanReason,
        reference: (input.reference || batchDoc.batchNumber).trim().slice(0, 150),
        performedBy: actor.uid,
        timestamp: serverTimestamp(),
      });

      attachAuditToTransaction(tx, {
        actor,
        actionType: 'INVENTORY_STOCK_ADJUSTMENT',
        affectedCollection: 'inventoryBatches',
        affectedRecordId: input.batchId,
        description: `Adjusted ${item.itemName} (Batch ${batchDoc.batchNumber}) from ${batchDoc.remainingQuantity} to ${targetQty} ${item.unit}. Reason: ${cleanReason}.`,
      });
    });

    if (triggeredLowStock && itemForAlert) {
      const item = itemForAlert as InventoryItem;
      const alertBatch = writeBatch(db);
      attachNotificationToBatch(alertBatch, {
        title: `Low Stock Alert: ${item.itemName}`,
        message: `${item.itemName} is at ${finalTotal} ${item.unit} after stock adjustment (minimum level: ${item.minimumStockLevel} ${item.unit}).`,
        notificationType: 'low_stock',
        recipientRoles: ['Administrative Clerk', 'Data Controller', 'Nurse'],
        relatedRecordId: item.itemId,
      });
      await alertBatch.commit();
    }
  } catch (error) {
    if (error instanceof Error && !error.message.includes('permission')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `inventoryBatches/${input.batchId}`);
  }
}

export function subscribeInventoryItems(onData: (items: InventoryItem[]) => void): Unsubscribe {
  const path = 'inventory';
  const q = query(collection(db, path), orderBy('itemName', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as InventoryItem));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeInventoryBatches(onData: (batches: InventoryBatch[]) => void): Unsubscribe {
  const path = 'inventoryBatches';
  const q = query(collection(db, path), orderBy('expirationDate', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as InventoryBatch));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeInventoryTransactions(
  onData: (txs: InventoryTransaction[]) => void
): Unsubscribe {
  const path = 'inventoryTransactions';
  const q = query(collection(db, path), orderBy('timestamp', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as InventoryTransaction));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
