import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  formatTimestamp,
  isExpiredDate,
  isExpiringSoon,
  todayIsoDate,
} from '../lib/formatters';
import {
  adjustInventoryBatchStock,
  createInventoryItem,
  dispenseInventoryFefo,
  receiveInventoryBatch,
} from '../services/inventoryService';
import type {
  InventoryBatch,
  InventoryItem,
  InventoryTransaction,
} from '../types/caresync';

interface InventoryViewProps {
  items: InventoryItem[];
  batches: InventoryBatch[];
  transactions: InventoryTransaction[];
}

export function InventoryView({ items, batches, transactions }: InventoryViewProps) {
  const { appUser, capabilities } = useAuth();
  const [tab, setTab] = useState<'stock' | 'ledger'>('stock');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [showAddItem, setShowAddItem] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<InventoryItem | null>(null);
  const [dispenseTarget, setDispenseTarget] = useState<InventoryItem | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{
    item: InventoryItem;
    batch: InventoryBatch;
  } | null>(null);

  // Forms
  const [itemForm, setItemForm] = useState({
    itemName: '',
    category: 'Analgesic / Antipyretic',
    description: '',
    unit: 'tablets',
    minimumStockLevel: '50',
  });
  const [receiveForm, setReceiveForm] = useState({
    batchNumber: '',
    quantityReceived: '',
    expirationDate: '',
    dateReceived: todayIsoDate(),
    reference: '',
    reason: 'Supply delivery received',
  });
  const [dispenseForm, setDispenseForm] = useState({
    quantity: '',
    reason: '',
    reference: '',
  });
  const [adjustForm, setAdjustForm] = useState({
    newBatchQuantity: '',
    reason: '',
    reference: '',
  });

  const batchesByItem = useMemo(() => {
    const map = new Map<string, InventoryBatch[]>();
    for (const b of batches) {
      const list = map.get(b.itemId) || [];
      list.push(b);
      map.set(b.itemId, list);
    }
    return map;
  }, [batches]);

  const itemById = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const it of items) map.set(it.itemId, it);
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.itemName.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.itemId.toLowerCase().includes(q)
    );
  }, [items, search]);

  if (!appUser || !capabilities) return null;

  const today = todayIsoDate();

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      await createInventoryItem(appUser, {
        ...itemForm,
        minimumStockLevel: Number(itemForm.minimumStockLevel) || 0,
      });
      setShowAddItem(false);
      setItemForm({
        itemName: '',
        category: 'Analgesic / Antipyretic',
        description: '',
        unit: 'tablets',
        minimumStockLevel: '50',
      });
      setFeedback({ type: 'ok', text: 'Catalog item created.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to create item.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await receiveInventoryBatch(appUser, {
        itemId: receiveTarget.itemId,
        batchNumber: receiveForm.batchNumber,
        quantityReceived: Number(receiveForm.quantityReceived),
        expirationDate: receiveForm.expirationDate,
        dateReceived: receiveForm.dateReceived,
        reference: receiveForm.reference,
        reason: receiveForm.reason,
      });
      setReceiveTarget(null);
      setReceiveForm({
        batchNumber: '',
        quantityReceived: '',
        expirationDate: '',
        dateReceived: todayIsoDate(),
        reference: '',
        reason: 'Supply delivery received',
      });
      setFeedback({ type: 'ok', text: `Batch received for ${receiveTarget.itemName}.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Receive failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispenseFefo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispenseTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await dispenseInventoryFefo(appUser, {
        itemId: dispenseTarget.itemId,
        quantity: Number(dispenseForm.quantity),
        reason: dispenseForm.reason,
        reference: dispenseForm.reference,
      });
      setDispenseTarget(null);
      setDispenseForm({ quantity: '', reason: '', reference: '' });
      const batchSummary = result.dispensedFromBatches
        .map((b) => `${b.batchNumber} (exp ${b.expirationDate}): -${b.deducted}`)
        .join(', ');
      setFeedback({
        type: 'ok',
        text: `Dispensed via FEFO [${batchSummary}]. New total: ${result.newTotal}. ${
          result.triggeredLowStock ? 'Low-stock alert generated!' : ''
        }`,
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Dispense failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await adjustInventoryBatchStock(appUser, {
        itemId: adjustTarget.item.itemId,
        batchId: adjustTarget.batch.batchId,
        newBatchQuantity: Number(adjustForm.newBatchQuantity),
        reason: adjustForm.reason,
        reference: adjustForm.reference,
      });
      setAdjustTarget(null);
      setAdjustForm({ newBatchQuantity: '', reason: '', reference: '' });
      setFeedback({ type: 'ok', text: 'Physical stock adjustment recorded.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Adjustment failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Medical Inventory &amp; FEFO Batch Control
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            First Expired, First Out (FEFO) dispensing blocks expired batches and generates automatic low-stock alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('stock')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'stock' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Stock &amp; Batches ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('ledger')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'ledger' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Transaction Ledger ({transactions.length})
            </button>
          </div>

          {capabilities.canReceiveInventory && (
            <button
              type="button"
              onClick={() => setShowAddItem(true)}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Catalog Item
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {tab === 'stock' && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search medical supplies by name or category..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="space-y-4">
            {filteredItems.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                No inventory items found.
              </div>
            ) : (
              filteredItems.map((item) => {
                const itemBatches = (batchesByItem.get(item.itemId) || []).sort((a, b) =>
                  a.expirationDate.localeCompare(b.expirationDate)
                );
                const usableStock = itemBatches
                  .filter((b) => b.remainingQuantity > 0 && b.expirationDate >= today)
                  .reduce((sum, b) => sum + b.remainingQuantity, 0);
                const isLow = item.totalQuantity <= item.minimumStockLevel;

                return (
                  <div
                    key={item.itemId}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{item.category}</span>
                          <span>·</span>
                          <span className="font-mono">{item.itemId}</span>
                          {isLow && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Low Stock
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                          {item.itemName}
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 shrink-0">
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-lg font-semibold text-slate-900">
                            {usableStock} <span className="text-xs font-sans font-normal text-slate-500">{item.unit} usable</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Total: {item.totalQuantity} · Min: {item.minimumStockLevel}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {capabilities.canReceiveInventory && (
                            <button
                              type="button"
                              onClick={() => setReceiveTarget(item)}
                              className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <PackagePlus className="w-3.5 h-3.5 text-teal-700" />
                              Receive Batch
                            </button>
                          )}
                          {capabilities.canDispenseInventory && (
                            <button
                              type="button"
                              disabled={usableStock <= 0}
                              onClick={() => setDispenseTarget(item)}
                              className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <ArrowUpCircle className="w-3.5 h-3.5" />
                              Dispense (FEFO)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Batches Table */}
                    {itemBatches.length > 0 && (
                      <div className="overflow-x-auto border-t border-slate-100 pt-3">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="text-slate-500">
                              <th className="py-1.5 pr-4 font-medium">Batch #</th>
                              <th className="py-1.5 pr-4 font-medium">Expiration</th>
                              <th className="py-1.5 pr-4 font-medium">Received</th>
                              <th className="py-1.5 pr-4 font-medium">Remaining / Initial</th>
                              <th className="py-1.5 pr-4 font-medium">FEFO Eligibility</th>
                              {capabilities.canAdjustInventory && (
                                <th className="py-1.5 text-right font-medium">Adjustment</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                            {itemBatches.map((b, idx) => {
                              const expired = isExpiredDate(b.expirationDate);
                              const soon = isExpiringSoon(b.expirationDate);
                              const isFirstEligible =
                                !expired &&
                                b.remainingQuantity > 0 &&
                                itemBatches.findIndex(
                                  (x) => !isExpiredDate(x.expirationDate) && x.remainingQuantity > 0
                                ) === idx;

                              return (
                                <tr key={b.batchId} className={expired ? 'opacity-60' : ''}>
                                  <td className="py-2 pr-4 text-slate-900">{b.batchNumber}</td>
                                  <td
                                    className={`py-2 pr-4 ${
                                      expired
                                        ? 'text-red-700 font-semibold'
                                        : soon
                                        ? 'text-amber-700 font-medium'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {b.expirationDate}
                                  </td>
                                  <td className="py-2 pr-4 text-slate-600">{b.dateReceived}</td>
                                  <td className="py-2 pr-4">
                                    {b.remainingQuantity} / {b.quantityReceived} {item.unit}
                                  </td>
                                  <td className="py-2 pr-4 font-sans">
                                    {expired ? (
                                      <span className="text-red-700 font-medium">
                                        Expired — blocked from dispensing
                                      </span>
                                    ) : b.remainingQuantity === 0 ? (
                                      <span className="text-slate-400">Depleted</span>
                                    ) : isFirstEligible ? (
                                      <span className="text-teal-800 font-medium">
                                        Next in FEFO queue
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">Eligible</span>
                                    )}
                                  </td>
                                  {capabilities.canAdjustInventory && (
                                    <td className="py-2 text-right font-sans">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAdjustTarget({ item, batch: b });
                                          setAdjustForm({
                                            newBatchQuantity: String(b.remainingQuantity),
                                            reason: '',
                                            reference: b.batchNumber,
                                          });
                                        }}
                                        className="text-xs text-slate-600 hover:text-teal-800 inline-flex items-center gap-1"
                                      >
                                        <SlidersHorizontal className="w-3 h-3" />
                                        Adjust
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Transaction Ledger Tab */}
      {tab === 'ledger' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Delta</th>
                <th className="py-3 px-4">Prev → New</th>
                <th className="py-3 px-4">Reason &amp; Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => {
                const it = itemById.get(tx.itemId);
                return (
                  <tr key={tx.transactionId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatTimestamp(tx.timestamp)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {it ? it.itemName : tx.itemId}
                    </td>
                    <td className="py-3 px-4 capitalize">
                      {tx.transactionType === 'received' && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <ArrowDownCircle className="w-3.5 h-3.5" />
                          Received
                        </span>
                      )}
                      {tx.transactionType === 'dispensed' && (
                        <span className="inline-flex items-center gap-1 text-teal-800 font-medium">
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          Dispensed
                        </span>
                      )}
                      {tx.transactionType === 'stock_adjustment' && (
                        <span className="text-amber-700 font-medium">Adjustment</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {tx.transactionType === 'dispensed' ? `-${tx.quantity}` : tx.quantity}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {tx.previousQuantity} → {tx.newQuantity}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {tx.reason}
                      {tx.reference ? ` (${tx.reference})` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Add Catalog Item */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Add Inventory Catalog Item</h3>
              <button type="button" onClick={() => setShowAddItem(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={itemForm.itemName}
                  onChange={(e) => setItemForm({ ...itemForm, itemName: e.target.value })}
                  placeholder="Cefalexin 500mg Capsule"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
                  <input
                    type="text"
                    required
                    value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit *</label>
                  <input
                    type="text"
                    required
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    placeholder="tablets, vials, boxes"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Minimum Stock Alert Level *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={itemForm.minimumStockLevel}
                  onChange={(e) => setItemForm({ ...itemForm, minimumStockLevel: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 border border-slate-200 text-xs font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-lg"
                >
                  Create Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Receive Batch */}
      {receiveTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Receive Supply Batch</h3>
                <p className="text-xs text-slate-500">{receiveTarget.itemName}</p>
              </div>
              <button type="button" onClick={() => setReceiveTarget(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleReceiveBatch} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Batch Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={receiveForm.batchNumber}
                    onChange={(e) =>
                      setReceiveForm({ ...receiveForm, batchNumber: e.target.value })
                    }
                    placeholder="LOT-2026-01"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity ({receiveTarget.unit}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={receiveForm.quantityReceived}
                    onChange={(e) =>
                      setReceiveForm({ ...receiveForm, quantityReceived: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expiration Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={receiveForm.expirationDate}
                    onChange={(e) =>
                      setReceiveForm({ ...receiveForm, expirationDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date Received *
                  </label>
                  <input
                    type="date"
                    required
                    value={receiveForm.dateReceived}
                    onChange={(e) =>
                      setReceiveForm({ ...receiveForm, dateReceived: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Delivery Receipt / Reference
                </label>
                <input
                  type="text"
                  value={receiveForm.reference}
                  onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })}
                  placeholder="DR-2026-..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReceiveTarget(null)}
                  className="px-4 py-2 border border-slate-200 text-xs font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-lg"
                >
                  Record Batch Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: FEFO Dispense */}
      {dispenseTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Dispense Supply (FEFO)</h3>
                <p className="text-xs text-slate-500">{dispenseTarget.itemName}</p>
              </div>
              <button type="button" onClick={() => setDispenseTarget(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Eligible non-expired batches are deducted automatically starting with the earliest expiration date. Expired batches are strictly skipped.
            </p>
            <form onSubmit={handleDispenseFefo} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Quantity to Dispense ({dispenseTarget.unit}) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={dispenseForm.quantity}
                  onChange={(e) => setDispenseForm({ ...dispenseForm, quantity: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Dispensing Reason / Prescription *
                </label>
                <input
                  type="text"
                  required
                  value={dispenseForm.reason}
                  onChange={(e) => setDispenseForm({ ...dispenseForm, reason: e.target.value })}
                  placeholder="Outpatient dispensing for visit..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Patient / Visit Reference
                </label>
                <input
                  type="text"
                  value={dispenseForm.reference}
                  onChange={(e) => setDispenseForm({ ...dispenseForm, reference: e.target.value })}
                  placeholder="PAT-2026-..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDispenseTarget(null)}
                  className="px-4 py-2 border border-slate-200 text-xs font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-lg"
                >
                  Confirm FEFO Dispense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Physical Stock Adjustment */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Physical Stock Adjustment</h3>
                <p className="text-xs text-slate-500">
                  {adjustTarget.item.itemName} · Batch {adjustTarget.batch.batchNumber}
                </p>
              </div>
              <button type="button" onClick={() => setAdjustTarget(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Physical Batch Quantity (max {adjustTarget.batch.quantityReceived}) *
                </label>
                <input
                  type="number"
                  min="0"
                  max={adjustTarget.batch.quantityReceived}
                  required
                  value={adjustForm.newBatchQuantity}
                  onChange={(e) =>
                    setAdjustForm({ ...adjustForm, newBatchQuantity: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Adjustment Reason *
                </label>
                <input
                  type="text"
                  required
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  placeholder="Physical count reconciliation, damaged units, expired write-off..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reference</label>
                <input
                  type="text"
                  value={adjustForm.reference}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reference: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="px-4 py-2 border border-slate-200 text-xs font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-700 text-white text-xs font-medium rounded-lg"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
