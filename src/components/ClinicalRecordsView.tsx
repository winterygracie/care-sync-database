import React, { useEffect, useMemo, useState } from 'react';
import { Activity, HeartPulse, Search, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/formatters';
import {
  subscribeMedicalRecords,
  subscribeVisits,
  subscribeVitalSigns,
} from '../services/patientService';
import type { MedicalRecord, Patient, Visit, VitalSign } from '../types/caresync';

interface ClinicalRecordsViewProps {
  patients: Patient[];
  onOpenPatientChart: (patient: Patient) => void;
}

export function ClinicalRecordsView({
  patients,
  onOpenPatientChart,
}: ClinicalRecordsViewProps) {
  const { capabilities } = useAuth();
  const [tab, setTab] = useState<'visits' | 'vitals' | 'records'>('visits');
  const [search, setSearch] = useState('');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [vitals, setVitals] = useState<VitalSign[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);

  useEffect(() => {
    if (!capabilities?.canViewClinicalRecords) return;
    const u1 = subscribeVisits(setVisits);
    const u2 = subscribeVitalSigns(setVitals);
    const u3 = subscribeMedicalRecords(setRecords);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [capabilities?.canViewClinicalRecords]);

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>();
    for (const p of patients) m.set(p.patientId, p);
    return m;
  }, [patients]);

  if (!capabilities?.canViewClinicalRecords) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-600">
        Your assigned role does not permit viewing confidential clinical medical records, visits, or vital signs.
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const matchPatient = (patientId: string) => {
    if (!q) return true;
    const p = patientMap.get(patientId);
    const name = p ? `${p.firstName} ${p.lastName}`.toLowerCase() : '';
    return patientId.toLowerCase().includes(q) || name.includes(q);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Clinical Consultations &amp; Records</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Longitudinal visits, vital signs, allergies, medications, and maternal health notes.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('visits')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'visits' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Visits ({visits.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('vitals')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'vitals' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Vital Signs ({vitals.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('records')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'records' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Medical Summaries ({records.length})
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter clinical entries by Patient ID or patient name..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      </div>

      {tab === 'visits' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-100">
            {visits.filter((v) => matchPatient(v.patientId)).length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No consultation visits found.</p>
            ) : (
              visits
                .filter((v) => matchPatient(v.patientId))
                .map((v) => {
                  const p = patientMap.get(v.patientId);
                  return (
                    <div key={v.visitId} className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Stethoscope className="w-3.5 h-3.5 text-teal-700" />
                          <span className="font-mono text-slate-800 font-medium">{v.visitDate}</span>
                          <span>·</span>
                          <span className="font-mono">{v.patientId}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-900">
                          {p ? `${p.firstName} ${p.lastName}` : v.patientId}
                        </h4>
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">Symptoms:</span> {v.symptoms}
                        </p>
                        {v.diagnosis && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Diagnosis:</span> {v.diagnosis}
                          </p>
                        )}
                        {v.prescribedTreatment && (
                          <p className="text-xs text-slate-600">
                            <span className="font-medium">Treatment:</span> {v.prescribedTreatment}
                          </p>
                        )}
                      </div>
                      {p && (
                        <button
                          type="button"
                          onClick={() => onOpenPatientChart(p)}
                          className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg whitespace-nowrap self-start"
                        >
                          Open Chart
                        </button>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {tab === 'vitals' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Recorded</th>
                <th className="py-3 px-4">BP</th>
                <th className="py-3 px-4">Temp</th>
                <th className="py-3 px-4">HR</th>
                <th className="py-3 px-4">RR</th>
                <th className="py-3 px-4">Wt / Ht</th>
                <th className="py-3 px-4 text-right">Chart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vitals
                .filter((vs) => matchPatient(vs.patientId))
                .map((vs) => {
                  const p = patientMap.get(vs.patientId);
                  return (
                    <tr key={vs.vitalId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {p ? `${p.firstName} ${p.lastName}` : vs.patientId}
                        </div>
                        <div className="font-mono text-slate-500">{vs.patientId}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatTimestamp(vs.recordedAt)}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{vs.bloodPressure || '—'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {vs.temperature != null ? `${vs.temperature} °C` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {vs.heartRate != null ? `${vs.heartRate} bpm` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {vs.respiratoryRate != null ? `${vs.respiratoryRate}/m` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {vs.weight ?? '—'} kg / {vs.height ?? '—'} cm
                      </td>
                      <td className="py-3 px-4 text-right">
                        {p && (
                          <button
                            type="button"
                            onClick={() => onOpenPatientChart(p)}
                            className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md"
                          >
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'records' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {records
            .filter((r) => matchPatient(r.patientId))
            .map((r) => {
              const p = patientMap.get(r.patientId);
              return (
                <div key={r.recordId} className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Activity className="w-3.5 h-3.5 text-teal-700" />
                      <span className="font-mono">{r.patientId}</span>
                      <span>·</span>
                      <span>Updated {formatTimestamp(r.updatedAt)}</span>
                    </div>
                    <h4 className="font-semibold text-slate-900">
                      {p ? `${p.firstName} ${p.lastName}` : r.patientId}
                    </h4>
                    <p className="text-slate-700">
                      <span className="font-medium">Conditions:</span> {r.medicalConditions || 'None'}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-medium">Allergies:</span> {r.allergies || 'None'}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-medium">Medications:</span> {r.medications || 'None'}
                    </p>
                    {r.maternalHealthNotes && (
                      <p className="text-teal-900 text-xs flex items-center gap-1.5">
                        <HeartPulse className="w-3.5 h-3.5" />
                        <span>Maternal Care: {r.maternalHealthNotes}</span>
                      </p>
                    )}
                  </div>
                  {p && (
                    <button
                      type="button"
                      onClick={() => onOpenPatientChart(p)}
                      className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg whitespace-nowrap self-start"
                    >
                      Edit Chart
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
