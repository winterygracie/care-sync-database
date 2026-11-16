import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bell, CalendarClock, Check, Package } from 'lucide-react';
import { formatTimestamp } from '../lib/formatters';
import { markNotificationRead } from '../services/notificationService';
import type { NotificationType, SystemNotification } from '../types/caresync';

interface NotificationsViewProps {
  notifications: SystemNotification[];
}

export function NotificationsView({ notifications }: NotificationsViewProps) {
  const [filterType, setFilterType] = useState<'all' | NotificationType>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (filterType !== 'all' && n.notificationType !== filterType) return false;
      if (showUnreadOnly && n.isRead) return false;
      return true;
    });
  }, [notifications, filterType, showUnreadOnly]);

  const handleToggleRead = async (n: SystemNotification) => {
    await markNotificationRead(n.notificationId, !n.isRead);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Notifications &amp; Operational Alerts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Next-day appointment follow-ups, low-stock warnings, and duplicate patient review alerts. Clinic staff remain responsible for contacting patients about follow-up visits.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors self-start whitespace-nowrap ${
            showUnreadOnly
              ? 'bg-teal-700 border-teal-700 text-white'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {showUnreadOnly ? 'Showing Unread Only' : 'Show Unread Only'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {(
          [
            { id: 'all', label: 'All Alerts' },
            { id: 'appointment_followup', label: 'Next-Day Follow-Ups' },
            { id: 'low_stock', label: 'Low Stock' },
            { id: 'duplicate_review', label: 'Duplicate Reviews' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterType(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filterType === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No notifications match this filter.
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.notificationId}
              className={`p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                !n.isRead ? 'bg-teal-50/20' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {n.notificationType === 'low_stock' ? (
                    <Package className="w-4 h-4 text-red-600" />
                  ) : n.notificationType === 'duplicate_review' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  ) : n.notificationType === 'appointment_followup' ? (
                    <CalendarClock className="w-4 h-4 text-teal-700" />
                  ) : (
                    <Bell className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums">{formatTimestamp(n.createdAt)}</span>
                    <span>·</span>
                    <span>Target: {n.recipientRoles.join(', ')}</span>
                    {!n.isRead && (
                      <>
                        <span>·</span>
                        <span className="text-teal-800 font-semibold">Unread</span>
                      </>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">{n.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleToggleRead(n)}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap self-start shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                {n.isRead ? 'Mark Unread' : 'Mark Read'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
