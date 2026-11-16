import React, { useMemo, useState } from 'react';
import { BellRing, CalendarPlus, Edit3, Lock, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { todayIsoDate, tomorrowIsoDate } from '../lib/formatters';
import {
  createAppointment,
  generateNextDayFollowupNotifications,
  updateAppointment,
} from '../services/appointmentService';
import type { Appointment, AppointmentStatus, Patient } from '../types/caresync';

interface AppointmentsViewProps {
  appointments: Appointment[];
  patients: Patient[];
}

export function AppointmentsView({ appointments, patients }: AppointmentsViewProps) {
  const { appUser, capabilities } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [createForm, setCreateForm] = useState({
    patientId: '',
    appointmentDate: tomorrowIsoDate(),
    appointmentTime: '09:00',
    appointmentType: 'Consultation',
    purpose: '',
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    appointmentDate: '',
    appointmentTime: '',
    appointmentType: '',
    purpose: '',
    status: 'scheduled' as AppointmentStatus,
    notes: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.patientName.toLowerCase().includes(q) ||
        a.patientId.toLowerCase().includes(q) ||
        a.appointmentType.toLowerCase().includes(q) ||
        a.purpose.toLowerCase().includes(q)
      );
    });
  }, [appointments, statusFilter, search]);

  if (!appUser || !capabilities) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const patient = patients.find((p) => p.patientId === createForm.patientId);
    if (!patient) {
      setFeedback({ type: 'err', text: 'Please select a registered patient.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await createAppointment(appUser, {
        patientId: patient.patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        appointmentDate: createForm.appointmentDate,
        appointmentTime: createForm.appointmentTime,
        appointmentType: createForm.appointmentType,
        purpose: createForm.purpose,
        notes: createForm.notes,
      });
      setShowCreateModal(false);
      setCreateForm({
        patientId: '',
        appointmentDate: tomorrowIsoDate(),
        appointmentTime: '09:00',
        appointmentType: 'Consultation',
        purpose: '',
        notes: '',
      });
      setFeedback({ type: 'ok', text: 'Appointment scheduled.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to schedule appointment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAppt) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await updateAppointment(appUser, editingAppt, editForm);
      setEditingAppt(null);
      setFeedback({ type: 'ok', text: 'Appointment updated.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update appointment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateFollowups = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const count = await generateNextDayFollowupNotifications(appUser);
      setFeedback({
        type: 'ok',
        text:
          count > 0
            ? `Generated ${count} next-day follow-up reminder(s) for tomorrow (${tomorrowIsoDate()}). Clinic staff remain responsible for contacting patients.`
            : `No scheduled appointments found for tomorrow (${tomorrowIsoDate()}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to generate follow-up reminders.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const today = todayIsoDate();

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Appointments &amp; Follow-Ups</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Schedule patient visits, track attendance status, and trigger next-day staff follow-up notifications.
          </p>
        </div>

        {capabilities.canManageAppointments && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleGenerateFollowups()}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5 text-teal-700" />
              Generate Next-Day Reminders
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Schedule Appointment
            </button>
          </div>
        )}
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

      {/* Search & Status Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient name, ID, type, or purpose..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          {(['all', 'scheduled', 'completed', 'missed', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Appointments Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No appointments match the current filter.
          </p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Type &amp; Purpose</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((a) => {
                const isTerminal = a.status === 'completed' || a.status === 'cancelled';
                const canEditThis =
                  capabilities.canManageAppointments &&
                  (!isTerminal || capabilities.canOverrideTerminalAppointments);
                const isToday = a.appointmentDate === today;

                return (
                  <tr key={a.appointmentId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 font-medium">
                        {a.appointmentDate} {isToday ? '· Today' : ''}
                      </div>
                      <div className="text-slate-500">{a.appointmentTime}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{a.patientName}</div>
                      <div className="font-mono text-xs text-slate-500">{a.patientId}</div>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-medium text-slate-800 text-xs">{a.appointmentType}</div>
                      <div className="text-xs text-slate-600 truncate">{a.purpose}</div>
                    </td>
                    <td className="py-3 px-4 text-xs capitalize whitespace-nowrap">
                      <span
                        className={
                          a.status === 'scheduled'
                            ? 'text-teal-800 font-medium'
                            : a.status === 'completed'
                            ? 'text-emerald-700 font-medium'
                            : a.status === 'missed'
                            ? 'text-amber-700 font-medium'
                            : 'text-slate-500'
                        }
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {canEditThis ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAppt(a);
                            setEditForm({
                              appointmentDate: a.appointmentDate,
                              appointmentTime: a.appointmentTime,
                              appointmentType: a.appointmentType,
                              purpose: a.purpose,
                              status: a.status,
                              notes: a.notes,
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Manage
                        </button>
                      ) : isTerminal ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Lock className="w-3.5 h-3.5" />
                          Locked
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">View only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Appointment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Schedule Appointment</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Patient *</label>
                <select
                  required
                  value={createForm.patientId}
                  onChange={(e) => setCreateForm({ ...createForm, patientId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Select registered patient...</option>
                  {patients.map((p) => (
                    <option key={p.patientId} value={p.patientId}>
                      {p.lastName}, {p.firstName} ({p.patientId})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={createForm.appointmentDate}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, appointmentDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Time *</label>
                  <input
                    type="time"
                    required
                    value={createForm.appointmentTime}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, appointmentTime: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Appointment Type *
                </label>
                <select
                  value={createForm.appointmentType}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, appointmentType: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="Consultation">Consultation</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Prenatal Checkup">Prenatal Checkup</option>
                  <option value="Immunization">Immunization</option>
                  <option value="Postnatal Care">Postnatal Care</option>
                  <option value="Laboratory Review">Laboratory Review</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Purpose *</label>
                <input
                  type="text"
                  required
                  value={createForm.purpose}
                  onChange={(e) => setCreateForm({ ...createForm, purpose: e.target.value })}
                  placeholder="Reason for scheduled visit..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
                >
                  {submitting ? 'Saving...' : 'Save Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Appointment Modal */}
      {editingAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Manage Appointment — {editingAppt.patientName}
                </h3>
                <p className="text-xs font-mono text-slate-500">{editingAppt.appointmentId}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAppt(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={editForm.appointmentDate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, appointmentDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                  <input
                    type="time"
                    required
                    value={editForm.appointmentTime}
                    onChange={(e) =>
                      setEditForm({ ...editForm, appointmentTime: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <input
                    type="text"
                    required
                    value={editForm.appointmentType}
                    onChange={(e) =>
                      setEditForm({ ...editForm, appointmentType: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value as AppointmentStatus })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="scheduled">scheduled</option>
                    <option value="completed">completed</option>
                    <option value="missed">missed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Purpose</label>
                <input
                  type="text"
                  required
                  value={editForm.purpose}
                  onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAppt(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
                >
                  {submitting ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
