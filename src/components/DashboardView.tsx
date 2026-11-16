import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Database,
  Package,
  UserPlus,
  Users,
  Bell,
  ClipboardList,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { todayIsoDate, tomorrowIsoDate } from '../lib/formatters';
import { seedFictionalClinicData } from '../services/seedService';
import type {
  Appointment,
  InventoryBatch,
  InventoryItem,
  NavSection,
  Patient,
  SystemNotification,
} from '../types/caresync';

interface DashboardViewProps {
  patients: Patient[];
  appointments: Appointment[];
  inventoryItems: InventoryItem[];
  inventoryBatches: InventoryBatch[];
  notifications: SystemNotification[];
  onNavigate: (section: NavSection) => void;
  onQuickOpenPatient: (patient: Patient) => void;
}

export function DashboardView({
  patients,
  appointments,
  inventoryItems,
  inventoryBatches,
  notifications,
  onNavigate,
  onQuickOpenPatient,
}: DashboardViewProps) {
  const { appUser, capabilities } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  if (!appUser || !capabilities) return null;

  const today = todayIsoDate();
  const tomorrow = tomorrowIsoDate();

  const flaggedDuplicates = patients.filter((p) => p.duplicateStatus === 'flagged');
  const scheduledAppointments = appointments.filter((a) => a.status === 'scheduled');
  const tomorrowFollowups = scheduledAppointments.filter((a) => a.appointmentDate === tomorrow);
  const lowStockItems = inventoryItems.filter((item) => item.totalQuantity <= item.minimumStockLevel);
  const expiredBatches = inventoryBatches.filter(
    (b) => b.remainingQuantity > 0 && b.expirationDate < today
  );
  const unreadNotifications = notifications.filter((n) => !n.isRead);

  const apptCounts = {
    scheduled: appointments.filter((a) => a.status === 'scheduled').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
    missed: appointments.filter((a) => a.status === 'missed').length,
  };
  const totalAppts = Math.max(1, appointments.length);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      await seedFictionalClinicData(appUser);
      setSeedMessage('Fictional Ampayon Super Health Center dataset loaded into Firestore.');
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : 'Failed to seed data.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Role Header & Shortcuts */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">
            {appUser.role} · Ampayon Super Health Center
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
            {capabilities.dashboardLabel}
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            {capabilities.dashboardDescription}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {capabilities.canRegisterPatients && (
            <button
              type="button"
              onClick={() => onNavigate('patients')}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register Patient
            </button>
          )}
          {capabilities.canViewClinicalRecords && (
            <button
              type="button"
              onClick={() => onNavigate('clinical')}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Activity className="w-3.5 h-3.5" />
              Clinical Records
            </button>
          )}
          {capabilities.canManageAppointments && (
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5" />
              Manage Appointments
            </button>
          )}
          {capabilities.canDispenseInventory && (
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Package className="w-3.5 h-3.5" />
              FEFO Inventory
            </button>
          )}
        </div>
      </div>

      {/* Empty Database Setup Prompt for Data Controller */}
      {patients.length === 0 && appUser.role === 'Data Controller' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Initialize Fictional Clinic Development Dataset
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Your Firestore database is currently empty. Populate fictional patients, duplicate review test records,
                clinical visits, next-day appointments, and multi-batch FEFO supplies to verify every workflow.
              </p>
              {seedMessage && (
                <p className="text-xs font-medium text-teal-700 mt-2">{seedMessage}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeed()}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {seeding ? 'Seeding Firestore...' : 'Load Fictional Dataset'}
          </button>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Registered Patients</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {patients.length}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {flaggedDuplicates.length > 0 ? (
              <span className="text-amber-700 font-medium">
                {flaggedDuplicates.length} flagged for duplicate review
              </span>
            ) : (
              'No unresolved duplicate flags'
            )}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Scheduled Appointments</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {scheduledAppointments.length}
          </div>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {tomorrowFollowups.length} scheduled for tomorrow ({tomorrow})
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Supply Catalog &amp; Alerts</span>
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {inventoryItems.length}
          </div>
          <p className="text-xs mt-2 tabular-nums">
            {lowStockItems.length > 0 ? (
              <span className="text-red-700 font-medium">
                {lowStockItems.length} low-stock · {expiredBatches.length} expired batch(es)
              </span>
            ) : (
              <span className="text-slate-500">All items above minimum level</span>
            )}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Unread Staff Alerts</span>
            <Bell className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {unreadNotifications.length}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('notifications')}
            className="text-xs text-teal-700 hover:underline mt-2 inline-flex items-center gap-1"
          >
            Open notification inbox
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Dashboard Diagrams: Appointments Breakdown + Inventory Stock Ratio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Diagram 1: Appointment Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Appointment Status Distribution</h3>
              <p className="text-xs text-slate-500">Live totals across all recorded schedules</p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              Total: {appointments.length}
            </span>
          </div>

          <div className="space-y-4">
            {(
              [
                { label: 'Scheduled', value: apptCounts.scheduled, bar: 'bg-teal-700' },
                { label: 'Completed', value: apptCounts.completed, bar: 'bg-emerald-600' },
                { label: 'Missed', value: apptCounts.missed, bar: 'bg-amber-600' },
                { label: 'Cancelled', value: apptCounts.cancelled, bar: 'bg-slate-400' },
              ] as const
            ).map((row) => {
              const pct = Math.round((row.value / totalAppts) * 100);
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-700">{row.label}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {row.value} ({appointments.length ? pct : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${row.bar} rounded-full transition-all`}
                      style={{ width: `${appointments.length ? Math.max(pct, row.value > 0 ? 4 : 0) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Diagram 2: Inventory Stock vs Minimum Threshold */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Inventory Stock vs. Minimum Level</h3>
              <p className="text-xs text-slate-500">Aggregate non-expired &amp; warehouse stock health</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              View All
            </button>
          </div>

          {inventoryItems.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              No inventory items recorded yet.
            </p>
          ) : (
            <div className="space-y-4">
              {inventoryItems.slice(0, 5).map((item) => {
                const scaleMax = Math.max(item.minimumStockLevel * 2, item.totalQuantity, 1);
                const fillPct = Math.min(100, Math.round((item.totalQuantity / scaleMax) * 100));
                const thresholdPct = Math.min(100, Math.round((item.minimumStockLevel / scaleMax) * 100));
                const isLow = item.totalQuantity <= item.minimumStockLevel;
                return (
                  <div key={item.itemId}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-800 truncate pr-3">
                        {item.itemName}
                      </span>
                      <span
                        className={`font-mono tabular-nums whitespace-nowrap ${
                          isLow ? 'text-red-700 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {item.totalQuantity} / min {item.minimumStockLevel} {item.unit}
                      </span>
                    </div>
                    <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isLow ? 'bg-red-600' : 'bg-teal-700'}`}
                        style={{ width: `${Math.max(fillPct, item.totalQuantity > 0 ? 4 : 0)}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-900/50"
                        style={{ left: `${thresholdPct}%` }}
                        title={`Minimum threshold: ${item.minimumStockLevel}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Actionable Operational Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flagged Duplicate Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-base font-semibold text-slate-900">Duplicate Patient Reviews</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('patients')}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              Open Patients
            </button>
          </div>

          {flaggedDuplicates.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              All patient records are clear of unresolved duplicate flags.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {flaggedDuplicates.slice(0, 5).map((p) => (
                <div key={p.patientId} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {p.patientId} · DOB {p.dateOfBirth} · Matches {p.possibleDuplicateOf.join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onQuickOpenPatient(p)}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-teal-700" />
              <h3 className="text-base font-semibold text-slate-900">Upcoming Scheduled Visits</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              All Schedules
            </button>
          </div>

          {scheduledAppointments.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No upcoming scheduled appointments.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {scheduledAppointments.slice(0, 5).map((a) => (
                <div key={a.appointmentId} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{a.patientName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {a.appointmentType} · {a.purpose}
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums text-xs text-slate-700 shrink-0">
                    <div>{a.appointmentDate}</div>
                    <div className="text-slate-500">{a.appointmentTime}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
