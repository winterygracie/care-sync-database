import React, { useEffect, useMemo, useState } from 'react';
import { Search, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/formatters';
import { subscribeAuditLogs } from '../services/auditService';
import type { AuditLog } from '../types/caresync';

export function AuditLogsView() {
  const { capabilities } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('all');

  useEffect(() => {
    if (!capabilities?.canViewAuditLogs) return;
    return subscribeAuditLogs(setLogs, 250);
  }, [capabilities?.canViewAuditLogs]);

  const collections = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.affectedCollection);
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (collectionFilter !== 'all' && l.affectedCollection !== collectionFilter) return false;
      if (!q) return true;
      return (
        l.userName.toLowerCase().includes(q) ||
        l.actionType.toLowerCase().includes(q) ||
        l.affectedRecordId.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
      );
    });
  }, [logs, search, collectionFilter]);

  if (!capabilities?.canViewAuditLogs) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-600">
        Access to immutable audit logs is restricted to Data Controllers.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Immutable Audit Logs</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Append-only activity trail enforced by Firestore Security Rules. Ordinary users and controllers cannot edit or delete entries.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <Shield className="w-4 h-4 text-teal-700" />
          <span className="font-mono tabular-nums">{logs.length} records loaded</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action type, record ID, or description..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
        <select
          value={collectionFilter}
          onChange={(e) => setCollectionFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
        >
          <option value="all">All Collections</option>
          {collections.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Staff Actor</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Collection / Record</th>
              <th className="py-3 px-4">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No audit log entries match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.logId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{log.userName}</div>
                    <div className="text-slate-500">{log.userRole}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-800 whitespace-nowrap">
                    {log.actionType}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {log.affectedCollection}/{log.affectedRecordId}
                  </td>
                  <td className="py-3 px-4 text-slate-700 max-w-md">{log.description}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
