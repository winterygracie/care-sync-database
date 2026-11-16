import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AppUser,
  MedicalRecord,
  Patient,
  Visit,
  VitalSign,
} from '../types/caresync';
import { attachAuditToBatch, makeId } from './auditService';
import { attachNotificationToBatch } from './notificationService';

export function normalizeNamePart(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizePatientKey(
  firstName: string,
  lastName: string,
  dateOfBirth: string
): string {
  return `${normalizeNamePart(firstName)}|${normalizeNamePart(lastName)}|${dateOfBirth.trim()}`.slice(0, 180);
}

export function generatePatientId(): string {
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-5) + Math.random().toString(36).slice(2, 4).toUpperCase();
  return `PAT-${year}-${suffix}`;
}

export async function findPotentialDuplicatePatients(
  firstName: string,
  lastName: string,
  dateOfBirth: string,
  cachedPatients: Patient[]
): Promise<Patient[]> {
  const key = normalizePatientKey(firstName, lastName, dateOfBirth);
  const normFirst = normalizeNamePart(firstName);
  const normLast = normalizeNamePart(lastName);

  const matchesById = new Map<string, Patient>();

  try {
    const q = query(collection(db, 'patients'), where('normalizedKey', '==', key));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const p = d.data() as Patient;
      matchesById.set(p.patientId, p);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'patients');
  }

  for (const p of cachedPatients) {
    if (p.normalizedKey === key) {
      matchesById.set(p.patientId, p);
    } else if (
      p.dateOfBirth === dateOfBirth &&
      normalizeNamePart(p.lastName) === normLast &&
      (normalizeNamePart(p.firstName).startsWith(normFirst.slice(0, 3)) ||
        normFirst.startsWith(normalizeNamePart(p.firstName).slice(0, 3)))
    ) {
      matchesById.set(p.patientId, p);
    }
  }

  return Array.from(matchesById.values());
}

export interface PatientRegistrationInput {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  sex: 'Male' | 'Female' | 'Other';
  address: string;
  contactNumber: string;
  emergencyContact: string;
  possibleDuplicateIds?: string[];
}

export async function registerPatient(
  actor: AppUser,
  input: PatientRegistrationInput
): Promise<string> {
  const patientId = generatePatientId();
  const firstName = input.firstName.trim().slice(0, 80);
  const middleName = input.middleName.trim().slice(0, 80);
  const lastName = input.lastName.trim().slice(0, 80);
  const dateOfBirth = input.dateOfBirth.trim();
  const address = input.address.trim().slice(0, 250);
  const contactNumber = input.contactNumber.trim().slice(0, 30);
  const emergencyContact = input.emergencyContact.trim().slice(0, 150);

  if (!firstName || !lastName || !dateOfBirth || !address) {
    throw new Error('First name, last name, date of birth, and address are required.');
  }

  const normalizedKey = normalizePatientKey(firstName, lastName, dateOfBirth);
  const registrationDate = new Date().toISOString().slice(0, 10);
  const dupIds = (input.possibleDuplicateIds || []).slice(0, 10);
  const isFlagged = dupIds.length > 0;

  const batch = writeBatch(db);
  batch.set(doc(db, 'patients', patientId), {
    patientId,
    firstName,
    middleName,
    lastName,
    normalizedKey,
    dateOfBirth,
    sex: input.sex,
    address,
    contactNumber,
    emergencyContact,
    registrationDate,
    registeredBy: actor.uid,
    duplicateStatus: isFlagged ? 'flagged' : 'clear',
    possibleDuplicateOf: dupIds,
    duplicateReviewedBy: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (isFlagged) {
    attachNotificationToBatch(batch, {
      title: `Duplicate Review Required: ${firstName} ${lastName}`,
      message: `Patient ${patientId} (${firstName} ${lastName}, DOB ${dateOfBirth}) matched existing record(s): ${dupIds.join(', ')}. Staff review required.`,
      notificationType: 'duplicate_review',
      recipientRoles: ['Data Controller', 'Doctor', 'Nurse', 'BHW'],
      relatedRecordId: patientId,
    });
  }

  attachAuditToBatch(batch, {
    actor,
    actionType: isFlagged ? 'PATIENT_REGISTER_FLAGGED_DUPLICATE' : 'PATIENT_REGISTER',
    affectedCollection: 'patients',
    affectedRecordId: patientId,
    description: isFlagged
      ? `Registered patient ${patientId} (${firstName} ${lastName}) flagged for duplicate review against ${dupIds.join(', ')}.`
      : `Registered new patient ${patientId} (${firstName} ${lastName}).`,
  });

  try {
    await batch.commit();
    return patientId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `patients/${patientId}`);
  }
}

export async function updatePatientDemographics(
  actor: AppUser,
  patient: Patient,
  updates: {
    firstName: string;
    middleName: string;
    lastName: string;
    dateOfBirth: string;
    sex: 'Male' | 'Female' | 'Other';
    address: string;
    contactNumber: string;
    emergencyContact: string;
  }
): Promise<void> {
  const firstName = updates.firstName.trim().slice(0, 80);
  const middleName = updates.middleName.trim().slice(0, 80);
  const lastName = updates.lastName.trim().slice(0, 80);
  const dateOfBirth = updates.dateOfBirth.trim();
  const address = updates.address.trim().slice(0, 250);

  if (!firstName || !lastName || !dateOfBirth || !address) {
    throw new Error('First name, last name, date of birth, and address are required.');
  }

  const normalizedKey = normalizePatientKey(firstName, lastName, dateOfBirth);
  const batch = writeBatch(db);
  batch.update(doc(db, 'patients', patient.patientId), {
    firstName,
    middleName,
    lastName,
    normalizedKey,
    dateOfBirth,
    sex: updates.sex,
    address,
    contactNumber: updates.contactNumber.trim().slice(0, 30),
    emergencyContact: updates.emergencyContact.trim().slice(0, 150),
    updatedAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'PATIENT_UPDATE',
    affectedCollection: 'patients',
    affectedRecordId: patient.patientId,
    description: `Updated demographic profile for ${patient.patientId} (${firstName} ${lastName}).`,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `patients/${patient.patientId}`);
  }
}

export async function reviewDuplicatePatientRecord(
  actor: AppUser,
  patient: Patient,
  decision: 'confirmed_unique' | 'confirmed_duplicate'
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'patients', patient.patientId), {
    duplicateStatus: decision,
    duplicateReviewedBy: actor.uid,
    duplicateReviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'DUPLICATE_PATIENT_REVIEW',
    affectedCollection: 'patients',
    affectedRecordId: patient.patientId,
    description: `Reviewed potential duplicate patient ${patient.patientId} (${patient.firstName} ${patient.lastName}) and confirmed status: ${decision}.`,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `patients/${patient.patientId}`);
  }
}

export function subscribePatients(onData: (patients: Patient[]) => void): Unsubscribe {
  const path = 'patients';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        ...(d.data() as Patient),
        hasPendingWrites: d.metadata.hasPendingWrites,
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveMedicalRecord(
  actor: AppUser,
  patientId: string,
  existingRecord: MedicalRecord | null,
  input: {
    medicalConditions: string;
    allergies: string;
    medications: string;
    medicalHistory: string;
    maternalHealthNotes: string;
    notes: string;
  }
): Promise<string> {
  const recordId = existingRecord ? existingRecord.recordId : `rec_${patientId}`;
  const batch = writeBatch(db);

  if (existingRecord) {
    batch.update(doc(db, 'medicalRecords', recordId), {
      medicalConditions: input.medicalConditions.trim().slice(0, 2000),
      allergies: input.allergies.trim().slice(0, 1000),
      medications: input.medications.trim().slice(0, 2000),
      medicalHistory: input.medicalHistory.trim().slice(0, 4000),
      maternalHealthNotes: input.maternalHealthNotes.trim().slice(0, 2000),
      notes: input.notes.trim().slice(0, 2000),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(doc(db, 'medicalRecords', recordId), {
      recordId,
      patientId,
      medicalConditions: input.medicalConditions.trim().slice(0, 2000),
      allergies: input.allergies.trim().slice(0, 1000),
      medications: input.medications.trim().slice(0, 2000),
      medicalHistory: input.medicalHistory.trim().slice(0, 4000),
      maternalHealthNotes: input.maternalHealthNotes.trim().slice(0, 2000),
      notes: input.notes.trim().slice(0, 2000),
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  attachAuditToBatch(batch, {
    actor,
    actionType: existingRecord ? 'MEDICAL_RECORD_UPDATE' : 'MEDICAL_RECORD_CREATE',
    affectedCollection: 'medicalRecords',
    affectedRecordId: recordId,
    description: `${existingRecord ? 'Updated' : 'Created'} medical record for patient ${patientId}.`,
  });

  try {
    await batch.commit();
    return recordId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `medicalRecords/${recordId}`);
  }
}

export function subscribeMedicalRecords(
  onData: (records: MedicalRecord[]) => void,
  patientId?: string
): Unsubscribe {
  const path = 'medicalRecords';
  const q = patientId
    ? query(collection(db, path), where('patientId', '==', patientId), orderBy('updatedAt', 'desc'))
    : query(collection(db, path), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as MedicalRecord));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createPatientVisit(
  actor: AppUser,
  input: {
    patientId: string;
    visitDate: string;
    symptoms: string;
    diagnosis: string;
    prescribedTreatment: string;
    notes: string;
  }
): Promise<string> {
  const visitId = makeId('visit');
  const symptoms = input.symptoms.trim().slice(0, 2000);
  if (!symptoms) {
    throw new Error('Symptoms are required to record a visit.');
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'visits', visitId), {
    visitId,
    patientId: input.patientId,
    visitDate: input.visitDate,
    symptoms,
    diagnosis: input.diagnosis.trim().slice(0, 2000),
    prescribedTreatment: input.prescribedTreatment.trim().slice(0, 2000),
    notes: input.notes.trim().slice(0, 2000),
    recordedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'VISIT_CREATE',
    affectedCollection: 'visits',
    affectedRecordId: visitId,
    description: `Recorded consultation visit (${input.visitDate}) for patient ${input.patientId}.`,
  });

  try {
    await batch.commit();
    return visitId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `visits/${visitId}`);
  }
}

export function subscribeVisits(
  onData: (visits: Visit[]) => void,
  patientId?: string
): Unsubscribe {
  const path = 'visits';
  const q = patientId
    ? query(collection(db, path), where('patientId', '==', patientId), orderBy('visitDate', 'desc'))
    : query(collection(db, path), orderBy('visitDate', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as Visit));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function recordVitalSigns(
  actor: AppUser,
  input: {
    patientId: string;
    visitId?: string;
    bloodPressure: string;
    temperature: number | null;
    heartRate: number | null;
    respiratoryRate: number | null;
    weight: number | null;
    height: number | null;
    otherMeasurements: string;
    notes: string;
  }
): Promise<string> {
  const vitalId = makeId('vital');
  const batch = writeBatch(db);

  batch.set(doc(db, 'vitalSigns', vitalId), {
    vitalId,
    patientId: input.patientId,
    visitId: (input.visitId || '').trim().slice(0, 128),
    bloodPressure: input.bloodPressure.trim().slice(0, 30),
    temperature: input.temperature,
    heartRate: input.heartRate,
    respiratoryRate: input.respiratoryRate,
    weight: input.weight,
    height: input.height,
    otherMeasurements: input.otherMeasurements.trim().slice(0, 500),
    notes: input.notes.trim().slice(0, 1000),
    recordedBy: actor.uid,
    recordedAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'VITAL_SIGNS_RECORD',
    affectedCollection: 'vitalSigns',
    affectedRecordId: vitalId,
    description: `Recorded vital signs (BP: ${input.bloodPressure || 'N/A'}) for patient ${input.patientId}.`,
  });

  try {
    await batch.commit();
    return vitalId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `vitalSigns/${vitalId}`);
  }
}

export function subscribeVitalSigns(
  onData: (vitals: VitalSign[]) => void,
  patientId?: string
): Unsubscribe {
  const path = 'vitalSigns';
  const q = patientId
    ? query(collection(db, path), where('patientId', '==', patientId), orderBy('recordedAt', 'desc'))
    : query(collection(db, path), orderBy('recordedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as VitalSign));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
