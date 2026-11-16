import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp();

const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-09fa546c-0e61-4094-b4cb-eb4cf833c7be';
const db = getFirestore(DATABASE_ID);

type SystemRole =
  | 'Doctor'
  | 'Nurse'
  | 'BHW'
  | 'Administrative Clerk'
  | 'Data Controller'
  | 'Midwife';

async function getActiveStaffUser(uid: string) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'User profile not found.');
  }
  const data = snap.data()!;
  if (data.accountStatus !== 'active') {
    throw new HttpsError('permission-denied', 'Account is inactive.');
  }
  return {
    uid,
    fullName: String(data.fullName || 'Staff'),
    role: data.role as SystemRole,
  };
}

/**
 * Trigger: Generate low-stock notification whenever an inventory item
 * reaches or falls below its configured minimumStockLevel.
 */
export const onInventoryStockUpdated = onDocumentWritten(
  {
    document: 'inventory/{itemId}',
    database: DATABASE_ID,
  },
  async (event) => {
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after) return;

    const total = Number(after.totalQuantity ?? 0);
    const min = Number(after.minimumStockLevel ?? 0);
    const wasAboveMin = !before || Number(before.totalQuantity ?? 0) > min;

    if (total <= min && wasAboveMin) {
      const notificationId = `lowstock_${after.itemId}_${Date.now()}`;
      await db.collection('notifications').doc(notificationId).set({
        notificationId,
        title: `Low Stock Alert: ${after.itemName}`,
        message: `${after.itemName} has ${total} ${after.unit} remaining (minimum threshold: ${min} ${after.unit}).`,
        notificationType: 'low_stock',
        recipientRoles: ['Administrative Clerk', 'Data Controller', 'Nurse'],
        recipientUserIds: [],
        relatedRecordId: after.itemId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

/**
 * Scheduled Job: Runs daily at 07:00 Asia/Manila to generate next-day
 * appointment follow-up notifications for designated clinic staff.
 */
export const generateNextDayAppointmentReminders = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Asia/Manila',
  },
  async () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const yyyy = tomorrow.getUTCFullYear();
    const mm = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getUTCDate()).padStart(2, '0');
    const tomorrowStr = `${yyyy}-${mm}-${dd}`;

    const snapshot = await db
      .collection('appointments')
      .where('status', '==', 'scheduled')
      .where('appointmentDate', '==', tomorrowStr)
      .get();

    if (snapshot.empty) return;

    const batch = db.batch();
    for (const docSnap of snapshot.docs) {
      const appt = docSnap.data();
      const notificationId = `followup_${appt.appointmentId}_${tomorrowStr}`;
      const notifRef = db.collection('notifications').doc(notificationId);
      batch.set(
        notifRef,
        {
          notificationId,
          title: `Next-Day Follow-up: ${appt.patientName}`,
          message: `Scheduled ${appt.appointmentType} tomorrow (${tomorrowStr} at ${appt.appointmentTime}) — Purpose: ${appt.purpose}. Staff should contact patient for confirmation.`,
          notificationType: 'appointment_followup',
          recipientRoles: ['Administrative Clerk', 'Nurse', 'BHW', 'Midwife', 'Doctor'],
          recipientUserIds: [],
          relatedRecordId: appt.appointmentId,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
);

/**
 * Callable: Server-authoritative FEFO inventory dispensing transaction.
 * Rejects expired batches and insufficient stock, deducts earliest-expiring
 * eligible batches first, updates totalQuantity, logs transaction & audit entry.
 */
export const dispenseInventoryFefo = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email_verified) {
    throw new HttpsError('unauthenticated', 'Verified authentication required.');
  }

  const actor = await getActiveStaffUser(request.auth.uid);
  const allowed: SystemRole[] = ['Administrative Clerk', 'Data Controller', 'Nurse', 'Doctor', 'Midwife'];
  if (!allowed.includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Role not authorized for inventory dispensing.');
  }

  const { itemId, quantity, reason, reference } = request.data as {
    itemId: string;
    quantity: number;
    reason: string;
    reference?: string;
  };

  if (!itemId || typeof quantity !== 'number' || quantity <= 0 || !reason?.trim()) {
    throw new HttpsError('invalid-argument', 'Valid itemId, positive quantity, and reason are required.');
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return db.runTransaction(async (tx) => {
    const itemRef = db.collection('inventory').doc(itemId);
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists) {
      throw new HttpsError('not-found', 'Inventory item not found.');
    }
    const item = itemSnap.data()!;

    const batchesQuery = db
      .collection('inventoryBatches')
      .where('itemId', '==', itemId)
      .orderBy('expirationDate', 'asc');
    const batchesSnap = await tx.get(batchesQuery);

    const eligibleBatches = batchesSnap.docs
      .map((d) => ({ ref: d.ref, data: d.data() }))
      .filter((b) => Number(b.data.remainingQuantity) > 0 && String(b.data.expirationDate) >= todayStr);

    const totalEligible = eligibleBatches.reduce((sum, b) => sum + Number(b.data.remainingQuantity), 0);
    if (totalEligible < quantity) {
      throw new HttpsError(
        'failed-precondition',
        `Insufficient non-expired stock. Requested: ${quantity}, Available (non-expired): ${totalEligible}.`
      );
    }

    let remainingToDispense = quantity;
    let runningTotal = Number(item.totalQuantity ?? 0);

    for (const batch of eligibleBatches) {
      if (remainingToDispense <= 0) break;
      const batchAvail = Number(batch.data.remainingQuantity);
      const deduct = Math.min(batchAvail, remainingToDispense);
      const newBatchQty = batchAvail - deduct;
      const prevTotal = runningTotal;
      runningTotal = Math.max(0, runningTotal - deduct);

      tx.update(batch.ref, { remainingQuantity: newBatchQty });

      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      tx.set(db.collection('inventoryTransactions').doc(txId), {
        transactionId: txId,
        itemId,
        batchId: batch.data.batchId,
        transactionType: 'dispensed',
        quantity: deduct,
        previousQuantity: prevTotal,
        newQuantity: runningTotal,
        reason: reason.trim(),
        reference: (reference || '').trim(),
        performedBy: actor.uid,
        timestamp: FieldValue.serverTimestamp(),
      });

      remainingToDispense -= deduct;
    }

    tx.update(itemRef, {
      totalQuantity: runningTotal,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    tx.set(db.collection('auditLogs').doc(logId), {
      logId,
      userId: actor.uid,
      userName: actor.fullName,
      userRole: actor.role,
      actionType: 'INVENTORY_DISPENSE_FEFO',
      affectedCollection: 'inventory',
      affectedRecordId: itemId,
      description: `Dispensed ${quantity} ${item.unit} of ${item.itemName} via FEFO. Reason: ${reason.trim()}.`,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { itemId, dispensedQuantity: quantity, newTotalQuantity: runningTotal };
  });
});

/**
 * Callable: Server-verified duplicate patient review confirmation.
 */
export const reviewDuplicatePatient = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email_verified) {
    throw new HttpsError('unauthenticated', 'Verified authentication required.');
  }

  const actor = await getActiveStaffUser(request.auth.uid);
  const allowed: SystemRole[] = ['Data Controller', 'Doctor', 'Nurse', 'BHW'];
  if (!allowed.includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Role not authorized for duplicate patient review.');
  }

  const { patientId, decision } = request.data as {
    patientId: string;
    decision: 'confirmed_unique' | 'confirmed_duplicate';
  };

  if (!patientId || !['confirmed_unique', 'confirmed_duplicate'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Valid patientId and review decision are required.');
  }

  const patientRef = db.collection('patients').doc(patientId);
  const snap = await patientRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Patient record not found.');
  }

  const batch = db.batch();
  batch.update(patientRef, {
    duplicateStatus: decision,
    duplicateReviewedBy: actor.uid,
    duplicateReviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  batch.set(db.collection('auditLogs').doc(logId), {
    logId,
    userId: actor.uid,
    userName: actor.fullName,
    userRole: actor.role,
    actionType: 'DUPLICATE_PATIENT_REVIEW',
    affectedCollection: 'patients',
    affectedRecordId: patientId,
    description: `Reviewed potential duplicate patient ${patientId} and marked as ${decision}.`,
    timestamp: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return { patientId, decision, reviewedBy: actor.uid };
});
