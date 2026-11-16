import React, { useEffect, useState } from 'react';
import { UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/formatters';
import { subscribeAllUsers, updateUserRoleAndStatus } from '../services/authService';
import {
  SYSTEM_ROLES,
  type AccountStatus,
  type AppUser,
  type SystemRole,
} from '../types/caresync';

export function StaffAccessView() {
  const { appUser, capabilities } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!capabilities?.canManageUsers) return;
    return subscribeAllUsers(setUsers);
  }, [capabilities?.canManageUsers]);

  if (!appUser || !capabilities?.canManageUsers) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-600">
        Staff role and access administration is restricted to Data Controllers.
      </div>
    );
  }

  const handleUpdateUser = async (
    target: AppUser,
    role: SystemRole,
    accountStatus: AccountStatus
  ) => {
    setSavingUid(target.uid);
    setFeedback(null);
    try {
      await updateUserRoleAndStatus(appUser, target, role, accountStatus);
      setFeedback({
        type: 'ok',
        text: `Updated ${target.fullName} to ${role} (${accountStatus}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update staff account.',
      });
    } finally {
      setSavingUid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Staff &amp; Role Administration</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Assign one of the six system roles and manage active/inactive clinic access.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <UserCog className="w-4 h-4 text-teal-700" />
          <span className="font-mono tabular-nums">{users.length} accounts</span>
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

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
              <th className="py-3 px-4">Staff Member</th>
              <th className="py-3 px-4">Assigned Role</th>
              <th className="py-3 px-4">Account Status</th>
              <th className="py-3 px-4">Last Login</th>
              <th className="py-3 px-4">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-50/70">
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900">{u.fullName}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="py-3 px-4">
                  <select
                    disabled={savingUid === u.uid}
                    value={u.role}
                    onChange={(e) =>
                      void handleUpdateUser(u, e.target.value as SystemRole, u.accountStatus)
                    }
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {SYSTEM_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3 px-4">
                  <select
                    disabled={savingUid === u.uid || u.uid === appUser.uid}
                    value={u.accountStatus}
                    onChange={(e) =>
                      void handleUpdateUser(u, u.role, e.target.value as AccountStatus)
                    }
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </td>
                <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                  {formatTimestamp(u.lastLogin)}
                </td>
                <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                  {formatTimestamp(u.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
