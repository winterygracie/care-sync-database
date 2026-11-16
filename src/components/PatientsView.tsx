import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  FileText,
  HeartPulse,
  Plus,
  Search,
  Stethoscope,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { calculateAge, formatTimestamp, todayIsoDate } from '../lib/formatters';
import {
  createPatientVisit,
  findPotentialDuplicatePatients,
  recordVitalSigns,
  registerPatient,
  reviewDuplicatePatientRecord,
  saveMedicalRecord,
  subscribeMedicalRecords,
  subscribeVisits,
  subscribeVitalSigns,
  updatePatientDemographics,
} from '../services/patientService';
import type {
  Appointment,
  MedicalRecord,
  Patient,
  StaffProfile,
  Visit,
  VitalSign,
} from '../types/caresync';

interface PatientsViewProps {
  patients: Patient[];
  appointments: Appointment[];
  staffProfiles: StaffProfile[];
  initialSelectedPatient: Patient | null;
  onClearInitialSelected: () => void;
}

export function PatientsView({
  patients,
  appointments,
  staffProfiles,
  initialSelectedPatient,
  onClearInitialSelected,
}: PatientsViewProps) {
  const { appUser, capabilities } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'flagged'>('all');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<
    'overview' | 'medical' | 'visits' | 'vitals' | 'appointments'
  >('overview');

  // Registration modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regForm, setRegForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    sex: 'Female' as 'Male' | 'Female' | 'Other',
    address: '',
    contactNumber: '',
    emergencyContact: '',
  });
  const [duplicateMatches, setDuplicateMatches] = useState<Patient[] | null>(null);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Demographic edit state
  const [editingDemographics, setEditingDemographics] = useState(false);
  const [demoForm, setDemoForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    sex: 'Female' as 'Male' | 'Female' | 'Other',
    address: '',
    contactNumber: '',
    emergencyContact: '',
  });

  // Patient clinical subscriptions (only when clinical role opens a patient)
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [vitals, setVitals] = useState<VitalSign[]>([]);

  // Clinical forms state
  const [medForm, setMedForm] = useState({
    medicalConditions: '',
    allergies: '',
    medications: '',
    medicalHistory: '',
    maternalHealthNotes: '',
    notes: '',
  });
  const [visitForm, setVisitForm] = useState({
    visitDate: todayIsoDate(),
    symptoms: '',
    diagnosis: '',
    prescribedTreatment: '',
    notes: '',
  });
  const [vitalForm, setVitalForm] = useState({
    visitId: '',
    bloodPressure: '',
    temperature: '',
    heartRate: '',
    respiratoryRate: '',
    weight: '',
    height: '',
    otherMeasurements: '',
    notes: '',
  });
  const [actionMessage, setActionMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [savingAction, setSavingAction] = useState(false);

  useEffect(() => {
    if (initialSelectedPatient) {
      setSelectedPatientId(initialSelectedPatient.patientId);
      setProfileTab('overview');
      onClearInitialSelected();
    }
  }, [initialSelectedPatient, onClearInitialSelected]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.patientId === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  // Load clinical collections for selected patient only if permitted
  useEffect(() => {
    if (!selectedPatientId || !capabilities?.canViewClinicalRecords) {
      setMedicalRecords([]);
      setVisits([]);
      setVitals([]);
      return;
    }
    const unsubMed = subscribeMedicalRecords(setMedicalRecords, selectedPatientId);
    const unsubVisits = subscribeVisits(setVisits, selectedPatientId);
    const unsubVitals = subscribeVitalSigns(setVitals, selectedPatientId);
    return () => {
      unsubMed();
      unsubVisits();
      unsubVitals();
    };
  }, [selectedPatientId, capabilities?.canViewClinicalRecords]);

  // Populate demographic edit & medical record forms when selected patient changes
  useEffect(() => {
    if (!selectedPatient) return;
    setEditingDemographics(false);
    setDemoForm({
      firstName: selectedPatient.firstName,
      middleName: selectedPatient.middleName,
      lastName: selectedPatient.lastName,
      dateOfBirth: selectedPatient.dateOfBirth,
      sex: selectedPatient.sex,
      address: selectedPatient.address,
      contactNumber: selectedPatient.contactNumber,
      emergencyContact: selectedPatient.emergencyContact,
    });
  }, [selectedPatient]);

  useEffect(() => {
    const rec = medicalRecords[0] || null;
    setMedForm({
      medicalConditions: rec?.medicalConditions || '',
      allergies: rec?.allergies || '',
      medications: rec?.medications || '',
      medicalHistory: rec?.medicalHistory || '',
      maternalHealthNotes: rec?.maternalHealthNotes || '',
      notes: rec?.notes || '',
    });
  }, [medicalRecords]);

  const staffNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staffProfiles) {
      map.set(s.uid, `${s.fullName} (${s.role})`);
    }
    return map;
  }, [staffProfiles]);

  const filteredPatients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return patients.filter((p) => {
      if (filterMode === 'flagged' && p.duplicateStatus !== 'flagged') {
        return false;
      }
      if (!q) return true;
      const fullName = `${p.firstName} ${p.middleName} ${p.lastName}`.toLowerCase();
      return (
        p.patientId.toLowerCase().includes(q) ||
        fullName.includes(q) ||
        p.address.toLowerCase().includes(q)
      );
    });
  }, [patients, searchTerm, filterMode]);

  const flaggedCount = useMemo(
    () => patients.filter((p) => p.duplicateStatus === 'flagged').length,
    [patients]
  );

  const patientAppointments = useMemo(
    () => appointments.filter((a) => a.patientId === selectedPatientId),
    [appointments, selectedPatientId]
  );

  if (!appUser || !capabilities) return null;

  const handleCheckAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSubmitting(true);
    try {
      const matches = await findPotentialDuplicatePatients(
        regForm.firstName,
        regForm.lastName,
        regForm.dateOfBirth,
        patients
      );
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        setRegSubmitting(false);
        return;
      }
      const newId = await registerPatient(appUser, regForm);
      setShowRegisterModal(false);
      setDuplicateMatches(null);
      setRegForm({
        firstName: '',
        middleName: '',
        lastName: '',
        dateOfBirth: '',
        sex: 'Female',
        address: '',
        contactNumber: '',
        emergencyContact: '',
      });
      setSelectedPatientId(newId);
      setProfileTab('overview');
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleRegisterAsFlagged = async () => {
    if (!duplicateMatches) return;
    setRegSubmitting(true);
    setRegError(null);
    try {
      const newId = await registerPatient(appUser, {
        ...regForm,
        possibleDuplicateIds: duplicateMatches.map((m) => m.patientId),
      });
      setShowRegisterModal(false);
      setDuplicateMatches(null);
      setRegForm({
        firstName: '',
        middleName: '',
        lastName: '',
        dateOfBirth: '',
        sex: 'Female',
        address: '',
        contactNumber: '',
        emergencyContact: '',
      });
      setSelectedPatientId(newId);
      setProfileTab('overview');
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Flagged registration failed.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleSaveDemographics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSavingAction(true);
    setActionMessage(null);
    try {
      await updatePatientDemographics(appUser, selectedPatient, demoForm);
      setEditingDemographics(false);
      setActionMessage({ type: 'ok', text: 'Patient demographic profile updated.' });
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update patient.',
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleDuplicateDecision = async (
    decision: 'confirmed_unique' | 'confirmed_duplicate'
  ) => {
    if (!selectedPatient) return;
    setSavingAction(true);
    setActionMessage(null);
    try {
      await reviewDuplicatePatientRecord(appUser, selectedPatient, decision);
      setActionMessage({
        type: 'ok',
        text: `Duplicate review recorded as ${decision.replace('_', ' ')}.`,
      });
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to record duplicate review.',
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleSaveMedicalRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSavingAction(true);
    setActionMessage(null);
    try {
      await saveMedicalRecord(appUser, selectedPatient.patientId, medicalRecords[0] || null, medForm);
      setActionMessage({ type: 'ok', text: 'Medical record saved to Firestore.' });
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save medical record.',
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSavingAction(true);
    setActionMessage(null);
    try {
      await createPatientVisit(appUser, {
        patientId: selectedPatient.patientId,
        ...visitForm,
      });
      setVisitForm({
        visitDate: todayIsoDate(),
        symptoms: '',
        diagnosis: '',
        prescribedTreatment: '',
        notes: '',
      });
      setActionMessage({ type: 'ok', text: 'Visit recorded under patient profile.' });
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save visit.',
      });
    } finally {
      setSavingAction(false);
    }
  };

  const handleRecordVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSavingAction(true);
    setActionMessage(null);
    try {
      const parseNum = (val: string) => {
        const trimmed = val.trim();
        if (!trimmed) return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
      };
      await recordVitalSigns(appUser, {
        patientId: selectedPatient.patientId,
        visitId: vitalForm.visitId,
        bloodPressure: vitalForm.bloodPressure,
        temperature: parseNum(vitalForm.temperature),
        heartRate: parseNum(vitalForm.heartRate),
        respiratoryRate: parseNum(vitalForm.respiratoryRate),
        weight: parseNum(vitalForm.weight),
        height: parseNum(vitalForm.height),
        otherMeasurements: vitalForm.otherMeasurements,
        notes: vitalForm.notes,
      });
      setVitalForm({
        visitId: '',
        bloodPressure: '',
        temperature: '',
        heartRate: '',
        respiratoryRate: '',
        weight: '',
        height: '',
        otherMeasurements: '',
        notes: '',
      });
      setActionMessage({ type: 'ok', text: 'Vital signs saved.' });
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to record vital signs.',
      });
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Patient Registry &amp; Profiles</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Search by Patient ID or name, register new patients with duplicate detection, and inspect longitudinal charts.
          </p>
        </div>
        {capabilities.canRegisterPatients && (
          <button
            type="button"
            onClick={() => {
              setDuplicateMatches(null);
              setRegError(null);
              setShowRegisterModal(true);
            }}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 self-start whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Register New Patient
          </button>
        )}
      </div>

      {/* Search & Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Patient ID (PAT-2026-...) or patient name..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filterMode === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Patients ({patients.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('flagged')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filterMode === 'flagged'
                ? 'bg-white text-amber-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Flagged Duplicates ({flaggedCount})
          </button>
        </div>
      </div>

      {/* Patient Directory Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredPatients.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-600 mb-3">
              {searchTerm
                ? 'No matching patient profiles found for your query.'
                : 'No patient records in this view yet.'}
            </p>
            {capabilities.canRegisterPatients && !searchTerm && (
              <button
                type="button"
                onClick={() => setShowRegisterModal(true)}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
              >
                Register First Patient
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Patient ID</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Date of Birth / Sex</th>
                  <th className="py-3 px-4">Address &amp; Contact</th>
                  <th className="py-3 px-4">Duplicate Review</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPatients.map((p) => (
                  <tr
                    key={p.patientId}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      selectedPatientId === p.patientId ? 'bg-teal-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-800 whitespace-nowrap">
                      {p.patientId}
                      {p.hasPendingWrites && (
                        <span className="block text-[11px] text-amber-700">Queued offline</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {p.lastName}, {p.firstName} {p.middleName}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {p.dateOfBirth} ({calculateAge(p.dateOfBirth)}) · {p.sex}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {p.address}
                      {p.contactNumber ? ` · ${p.contactNumber}` : ''}
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      {p.duplicateStatus === 'flagged' && (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Flagged for review
                        </span>
                      )}
                      {p.duplicateStatus === 'confirmed_unique' && (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmed unique
                        </span>
                      )}
                      {p.duplicateStatus === 'confirmed_duplicate' && (
                        <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Confirmed duplicate
                        </span>
                      )}
                      {p.duplicateStatus === 'clear' && (
                        <span className="text-slate-500">Clear</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(p.patientId);
                          setProfileTab('overview');
                          setActionMessage(null);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                      >
                        Open Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Longitudinal Patient Profile Panel */}
      {selectedPatient && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <p className="text-xs font-mono tabular-nums text-slate-500">
                {selectedPatient.patientId} · Registered {selectedPatient.registrationDate}
              </p>
              <h3 className="text-xl font-semibold text-slate-900 mt-0.5">
                {selectedPatient.firstName} {selectedPatient.middleName} {selectedPatient.lastName}
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                DOB {selectedPatient.dateOfBirth} ({calculateAge(selectedPatient.dateOfBirth)}) · {selectedPatient.sex} · {selectedPatient.address}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPatientId(null)}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg self-start"
              aria-label="Close patient profile"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {actionMessage && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                actionMessage.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          {/* Profile Sub-navigation */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setProfileTab('overview')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                profileTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Demographics &amp; Duplicate Status
            </button>
            {capabilities.canViewClinicalRecords && (
              <>
                <button
                  type="button"
                  onClick={() => setProfileTab('medical')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    profileTab === 'medical'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Medical Record
                </button>
                <button
                  type="button"
                  onClick={() => setProfileTab('visits')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    profileTab === 'visits'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Visits ({visits.length})
                </button>
                <button
                  type="button"
                  onClick={() => setProfileTab('vitals')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    profileTab === 'vitals'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Vital Signs ({vitals.length})
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setProfileTab('appointments')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                profileTab === 'appointments'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Appointments ({patientAppointments.length})
            </button>
          </div>

          {/* Tab 1: Overview & Duplicate Review */}
          {profileTab === 'overview' && (
            <div className="space-y-6">
              {selectedPatient.duplicateStatus === 'flagged' && (
                <div className="p-4 border border-amber-200 bg-amber-50/70 rounded-xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-950">
                        Potential Duplicate Registration Flagged for Staff Review
                      </h4>
                      <p className="text-xs text-amber-900 mt-1">
                        Matched existing patient ID(s):{' '}
                        <span className="font-mono font-medium">
                          {selectedPatient.possibleDuplicateOf.join(', ')}
                        </span>
                        . Records are never automatically merged. Authorized staff must confirm below.
                      </p>
                    </div>
                  </div>

                  {capabilities.canReviewDuplicates && (
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={savingAction}
                        onClick={() => void handleDuplicateDecision('confirmed_unique')}
                        className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 text-xs font-medium rounded-lg"
                      >
                        Confirm Different Person (Unique)
                      </button>
                      <button
                        type="button"
                        disabled={savingAction}
                        onClick={() => void handleDuplicateDecision('confirmed_duplicate')}
                        className="px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium rounded-lg"
                      >
                        Confirm Duplicate Record
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedPatient.duplicateReviewedBy && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-teal-700" />
                  <span>
                    Duplicate review status: <strong className="text-slate-900">{selectedPatient.duplicateStatus}</strong> · Reviewed by{' '}
                    <span className="font-medium">
                      {staffNameById.get(selectedPatient.duplicateReviewedBy) ||
                        selectedPatient.duplicateReviewedBy}
                    </span>{' '}
                    on <span className="font-mono">{formatTimestamp(selectedPatient.duplicateReviewedAt)}</span>
                  </span>
                </div>
              )}

              {editingDemographics ? (
                <form onSubmit={handleSaveDemographics} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                    <input
                      type="text"
                      required
                      value={demoForm.firstName}
                      onChange={(e) => setDemoForm({ ...demoForm, firstName: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={demoForm.middleName}
                      onChange={(e) => setDemoForm({ ...demoForm, middleName: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      required
                      value={demoForm.lastName}
                      onChange={(e) => setDemoForm({ ...demoForm, lastName: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      required
                      value={demoForm.dateOfBirth}
                      onChange={(e) => setDemoForm({ ...demoForm, dateOfBirth: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sex</label>
                    <select
                      value={demoForm.sex}
                      onChange={(e) =>
                        setDemoForm({ ...demoForm, sex: e.target.value as 'Male' | 'Female' | 'Other' })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number</label>
                    <input
                      type="text"
                      value={demoForm.contactNumber}
                      onChange={(e) => setDemoForm({ ...demoForm, contactNumber: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                    <input
                      type="text"
                      required
                      value={demoForm.address}
                      onChange={(e) => setDemoForm({ ...demoForm, address: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Emergency Contact
                    </label>
                    <input
                      type="text"
                      value={demoForm.emergencyContact}
                      onChange={(e) => setDemoForm({ ...demoForm, emergencyContact: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <button
                      type="submit"
                      disabled={savingAction}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
                    >
                      Save Demographics
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDemographics(false)}
                      className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Contact Number</p>
                      <p className="font-mono text-slate-900 mt-0.5">
                        {selectedPatient.contactNumber || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Emergency Contact</p>
                      <p className="text-slate-900 mt-0.5">
                        {selectedPatient.emergencyContact || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Registered By</p>
                      <p className="text-slate-900 mt-0.5">
                        {staffNameById.get(selectedPatient.registeredBy) ||
                          selectedPatient.registeredBy}
                      </p>
                    </div>
                  </div>
                  {capabilities.canEditPatients && (
                    <button
                      type="button"
                      onClick={() => setEditingDemographics(true)}
                      className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Demographics
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Medical Record */}
          {profileTab === 'medical' && capabilities.canViewClinicalRecords && (
            <form onSubmit={handleSaveMedicalRecord} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Medical Conditions
                  </label>
                  <textarea
                    rows={3}
                    value={medForm.medicalConditions}
                    onChange={(e) => setMedForm({ ...medForm, medicalConditions: e.target.value })}
                    placeholder="Chronic conditions, diagnoses..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Allergies</label>
                  <textarea
                    rows={3}
                    value={medForm.allergies}
                    onChange={(e) => setMedForm({ ...medForm, allergies: e.target.value })}
                    placeholder="Drug, food, or environmental allergies..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Current Medications
                  </label>
                  <textarea
                    rows={3}
                    value={medForm.medications}
                    onChange={(e) => setMedForm({ ...medForm, medications: e.target.value })}
                    placeholder="Active prescriptions and dosages..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Maternal Health Information
                  </label>
                  <textarea
                    rows={3}
                    value={medForm.maternalHealthNotes}
                    onChange={(e) => setMedForm({ ...medForm, maternalHealthNotes: e.target.value })}
                    placeholder="Obstetric score, AOG, prenatal/postpartum notes..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Medical History
                  </label>
                  <textarea
                    rows={3}
                    value={medForm.medicalHistory}
                    onChange={(e) => setMedForm({ ...medForm, medicalHistory: e.target.value })}
                    placeholder="Past hospitalizations, surgeries, family history..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Clinical Notes
                  </label>
                  <textarea
                    rows={2}
                    value={medForm.notes}
                    onChange={(e) => setMedForm({ ...medForm, notes: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              {capabilities.canEditMedicalRecords && (
                <button
                  type="submit"
                  disabled={savingAction}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Save Medical Record
                </button>
              )}
            </form>
          )}

          {/* Tab 3: Visits History */}
          {profileTab === 'visits' && capabilities.canViewClinicalRecords && (
            <div className="space-y-6">
              {capabilities.canRecordVisits && (
                <form
                  onSubmit={handleCreateVisit}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                >
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-teal-700" />
                    Record New Consultation Visit
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Visit Date
                      </label>
                      <input
                        type="date"
                        required
                        value={visitForm.visitDate}
                        onChange={(e) => setVisitForm({ ...visitForm, visitDate: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Presenting Symptoms
                      </label>
                      <input
                        type="text"
                        required
                        value={visitForm.symptoms}
                        onChange={(e) => setVisitForm({ ...visitForm, symptoms: e.target.value })}
                        placeholder="Chief complaint and symptoms..."
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Diagnosis
                      </label>
                      <input
                        type="text"
                        value={visitForm.diagnosis}
                        onChange={(e) => setVisitForm({ ...visitForm, diagnosis: e.target.value })}
                        placeholder="Clinical assessment / diagnosis"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Prescribed Treatment
                      </label>
                      <input
                        type="text"
                        value={visitForm.prescribedTreatment}
                        onChange={(e) =>
                          setVisitForm({ ...visitForm, prescribedTreatment: e.target.value })
                        }
                        placeholder="Medications, instructions..."
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                      <input
                        type="text"
                        value={visitForm.notes}
                        onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
                        placeholder="Follow-up notes"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingAction}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
                  >
                    Append Visit to Profile
                  </button>
                </form>
              )}

              <div className="divide-y divide-slate-200">
                {visits.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">No consultation visits recorded yet.</p>
                ) : (
                  visits.map((v) => (
                    <div key={v.visitId} className="py-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="font-mono font-medium text-slate-900">
                          {v.visitDate} · {v.visitId}
                        </span>
                        <span>
                          Recorded by {staffNameById.get(v.recordedBy) || v.recordedBy}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">
                        <span className="font-medium">Symptoms:</span> {v.symptoms}
                      </p>
                      {v.diagnosis && (
                        <p className="text-sm text-slate-800">
                          <span className="font-medium">Diagnosis:</span> {v.diagnosis}
                        </p>
                      )}
                      {v.prescribedTreatment && (
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">Treatment:</span> {v.prescribedTreatment}
                        </p>
                      )}
                      {v.notes && <p className="text-xs text-slate-500">Notes: {v.notes}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Vital Signs */}
          {profileTab === 'vitals' && capabilities.canViewClinicalRecords && (
            <div className="space-y-6">
              {capabilities.canRecordVitals && (
                <form
                  onSubmit={handleRecordVitals}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                >
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <HeartPulse className="w-4 h-4 text-teal-700" />
                    Record Vital Signs
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Blood Pressure
                      </label>
                      <input
                        type="text"
                        value={vitalForm.bloodPressure}
                        onChange={(e) =>
                          setVitalForm({ ...vitalForm, bloodPressure: e.target.value })
                        }
                        placeholder="120/80"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Temp (°C)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="25"
                        max="46"
                        value={vitalForm.temperature}
                        onChange={(e) =>
                          setVitalForm({ ...vitalForm, temperature: e.target.value })
                        }
                        placeholder="36.6"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Heart Rate (bpm)
                      </label>
                      <input
                        type="number"
                        min="20"
                        max="260"
                        value={vitalForm.heartRate}
                        onChange={(e) => setVitalForm({ ...vitalForm, heartRate: e.target.value })}
                        placeholder="76"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Resp. Rate (/min)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="80"
                        value={vitalForm.respiratoryRate}
                        onChange={(e) =>
                          setVitalForm({ ...vitalForm, respiratoryRate: e.target.value })
                        }
                        placeholder="18"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Weight (kg)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="400"
                        value={vitalForm.weight}
                        onChange={(e) => setVitalForm({ ...vitalForm, weight: e.target.value })}
                        placeholder="62.5"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Height (cm)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="20"
                        max="260"
                        value={vitalForm.height}
                        onChange={(e) => setVitalForm({ ...vitalForm, height: e.target.value })}
                        placeholder="165"
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Linked Visit (optional)
                      </label>
                      <select
                        value={vitalForm.visitId}
                        onChange={(e) => setVitalForm({ ...vitalForm, visitId: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="">Standalone triage measurement</option>
                        {visits.map((v) => (
                          <option key={v.visitId} value={v.visitId}>
                            {v.visitDate} — {v.symptoms.slice(0, 40)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Other Measurements
                      </label>
                      <input
                        type="text"
                        value={vitalForm.otherMeasurements}
                        onChange={(e) =>
                          setVitalForm({ ...vitalForm, otherMeasurements: e.target.value })
                        }
                        placeholder="SpO2, FHT, RBS..."
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                      <input
                        type="text"
                        value={vitalForm.notes}
                        onChange={(e) => setVitalForm({ ...vitalForm, notes: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingAction}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
                  >
                    Save Vital Signs
                  </button>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Recorded</th>
                      <th className="py-2 pr-4">BP</th>
                      <th className="py-2 pr-4">Temp</th>
                      <th className="py-2 pr-4">HR</th>
                      <th className="py-2 pr-4">RR</th>
                      <th className="py-2 pr-4">Wt / Ht</th>
                      <th className="py-2 pr-4">Other</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {vitals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-slate-500 font-sans">
                          No vital signs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      vitals.map((vs) => (
                        <tr key={vs.vitalId}>
                          <td className="py-2.5 pr-4 font-sans text-slate-700">
                            {formatTimestamp(vs.recordedAt)}
                          </td>
                          <td className="py-2.5 pr-4">{vs.bloodPressure || '—'}</td>
                          <td className="py-2.5 pr-4">
                            {vs.temperature != null ? `${vs.temperature} °C` : '—'}
                          </td>
                          <td className="py-2.5 pr-4">
                            {vs.heartRate != null ? `${vs.heartRate} bpm` : '—'}
                          </td>
                          <td className="py-2.5 pr-4">
                            {vs.respiratoryRate != null ? `${vs.respiratoryRate}/m` : '—'}
                          </td>
                          <td className="py-2.5 pr-4">
                            {vs.weight ?? '—'} kg / {vs.height ?? '—'} cm
                          </td>
                          <td className="py-2.5 pr-4 font-sans text-slate-600">
                            {vs.otherMeasurements || vs.notes || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 5: Patient Appointments */}
          {profileTab === 'appointments' && (
            <div className="divide-y divide-slate-100 text-sm">
              {patientAppointments.length === 0 ? (
                <p className="text-slate-500 py-4">No appointments found for this patient.</p>
              ) : (
                patientAppointments.map((a) => (
                  <div key={a.appointmentId} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-900">
                        {a.appointmentType} — {a.purpose}
                      </p>
                      <p className="text-xs text-slate-500">{a.notes || 'No notes'}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums text-xs">
                      <div className="text-slate-900">
                        {a.appointmentDate} · {a.appointmentTime}
                      </div>
                      <div className="text-slate-500 capitalize">{a.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Register Patient Modal with Duplicate Detection */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Register New Patient</h3>
                <p className="text-xs text-slate-500">
                  Normalized first name, last name, and date of birth are checked automatically for duplicates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {regError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {regError}
              </div>
            )}

            {duplicateMatches ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-950">
                        Possible Existing Patient Match Found
                      </h4>
                      <p className="text-xs text-amber-900 mt-1">
                        To prevent duplicate patient profiles, registration was paused. Review the matching record(s)
                        below before proceeding. Records are never auto-merged.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                  {duplicateMatches.map((m) => (
                    <div key={m.patientId} className="p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {m.firstName} {m.middleName} {m.lastName}
                        </p>
                        <p className="text-xs font-mono text-slate-600 tabular-nums mt-0.5">
                          {m.patientId} · DOB {m.dateOfBirth} · {m.sex}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {m.address} {m.contactNumber ? `· ${m.contactNumber}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRegisterModal(false);
                          setDuplicateMatches(null);
                          setSelectedPatientId(m.patientId);
                          setProfileTab('overview');
                        }}
                        className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
                      >
                        Open Existing Profile
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDuplicateMatches(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg"
                  >
                    Edit Registration Details
                  </button>
                  <button
                    type="button"
                    disabled={regSubmitting}
                    onClick={() => void handleRegisterAsFlagged()}
                    className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium rounded-lg"
                  >
                    {regSubmitting
                      ? 'Flagging & Saving...'
                      : 'Register Anyway & Flag for Staff Review'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCheckAndRegister} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.firstName}
                    onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Middle Name
                  </label>
                  <input
                    type="text"
                    value={regForm.middleName}
                    onChange={(e) => setRegForm({ ...regForm, middleName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.lastName}
                    onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={regForm.dateOfBirth}
                    onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Sex *</label>
                  <select
                    value={regForm.sex}
                    onChange={(e) =>
                      setRegForm({ ...regForm, sex: e.target.value as 'Male' | 'Female' | 'Other' })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={regForm.contactNumber}
                    onChange={(e) => setRegForm({ ...regForm, contactNumber: e.target.value })}
                    placeholder="09XX-XXX-XXXX"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Address *</label>
                  <input
                    type="text"
                    required
                    value={regForm.address}
                    onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                    placeholder="Purok, Barangay Ampayon, Butuan City"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    value={regForm.emergencyContact}
                    onChange={(e) => setRegForm({ ...regForm, emergencyContact: e.target.value })}
                    placeholder="Name and phone number"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={regSubmitting}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
                  >
                    {regSubmitting ? 'Checking Duplicates...' : 'Check & Register Patient'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
