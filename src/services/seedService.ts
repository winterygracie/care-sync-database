import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AppUser } from '../types/caresync';
import { attachAuditToBatch } from './auditService';
import { normalizePatientKey } from './patientService';

export async function seedFictionalClinicData(actor: AppUser): Promise<void> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const in30Days = new Date(today);
  in30Days.setDate(today.getDate() + 30);
  const in30Str = in30Days.toISOString().slice(0, 10);

  const in180Days = new Date(today);
  in180Days.setDate(today.getDate() + 180);
  const in180Str = in180Days.toISOString().slice(0, 10);

  const expiredDate = new Date(today);
  expiredDate.setDate(today.getDate() - 14);
  const expiredStr = expiredDate.toISOString().slice(0, 10);

  const batch = writeBatch(db);

  const patients = [
    {
      patientId: 'PAT-2026-1001',
      firstName: 'Mateo',
      middleName: 'Reyes',
      lastName: 'Villanueva',
      dateOfBirth: '1984-05-14',
      sex: 'Male',
      address: 'Purok 3, Barangay Ampayon, Butuan City',
      contactNumber: '0917-555-0142',
      emergencyContact: 'Elena Villanueva (0917-555-0143)',
      duplicateStatus: 'clear',
      possibleDuplicateOf: [] as string[],
    },
    {
      patientId: 'PAT-2026-1002',
      firstName: 'Clarissa',
      middleName: 'Santos',
      lastName: 'Magbanua',
      dateOfBirth: '1995-09-22',
      sex: 'Female',
      address: 'Purok 7, Barangay Ampayon, Butuan City',
      contactNumber: '0918-555-0198',
      emergencyContact: 'Dante Magbanua (0918-555-0199)',
      duplicateStatus: 'clear',
      possibleDuplicateOf: [] as string[],
    },
    {
      patientId: 'PAT-2026-1003',
      firstName: 'Roberto',
      middleName: 'Cruz',
      lastName: 'Tanghal',
      dateOfBirth: '1968-11-03',
      sex: 'Male',
      address: 'Purok 2, Barangay Ampayon, Butuan City',
      contactNumber: '0920-555-0115',
      emergencyContact: 'Lourdes Tanghal (0920-555-0116)',
      duplicateStatus: 'clear',
      possibleDuplicateOf: [] as string[],
    },
    {
      patientId: 'PAT-2026-1004',
      firstName: 'Mateo',
      middleName: '',
      lastName: 'Villanueva',
      dateOfBirth: '1984-05-14',
      sex: 'Male',
      address: 'Purok 3, Ampayon, Butuan City',
      contactNumber: '0917-555-0142',
      emergencyContact: 'Elena Villanueva',
      duplicateStatus: 'flagged',
      possibleDuplicateOf: ['PAT-2026-1001'],
    },
  ];

  for (const p of patients) {
    batch.set(doc(db, 'patients', p.patientId), {
      ...p,
      normalizedKey: normalizePatientKey(p.firstName, p.lastName, p.dateOfBirth),
      registrationDate: todayStr,
      registeredBy: actor.uid,
      duplicateReviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Medical Records
  batch.set(doc(db, 'medicalRecords', 'rec_PAT-2026-1001'), {
    recordId: 'rec_PAT-2026-1001',
    patientId: 'PAT-2026-1001',
    medicalConditions: 'Stage 1 Essential Hypertension',
    allergies: 'None reported',
    medications: 'Losartan 50mg OD',
    medicalHistory: 'Monitored quarterly since 2024 at Ampayon Super Health Center.',
    maternalHealthNotes: '',
    notes: 'Advised low-sodium diet and regular BP monitoring.',
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'medicalRecords', 'rec_PAT-2026-1002'), {
    recordId: 'rec_PAT-2026-1002',
    patientId: 'PAT-2026-1002',
    medicalConditions: 'Prenatal Care (24 weeks AOG)',
    allergies: 'Penicillin (mild rash)',
    medications: 'Ferrous Sulfate + Folic Acid OD, Calcium Carbonate',
    medicalHistory: 'G2P1, uncomplicated first delivery in 2022.',
    maternalHealthNotes: 'Fundal height 24 cm, fetal heart tones 144 bpm, normotensive.',
    notes: 'Scheduled for glucose screening on next prenatal visit.',
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Visits
  batch.set(doc(db, 'visits', 'visit_seed_1001'), {
    visitId: 'visit_seed_1001',
    patientId: 'PAT-2026-1001',
    visitDate: todayStr,
    symptoms: 'Mild morning occipital headache, routine BP follow-up',
    diagnosis: 'Controlled Essential Hypertension',
    prescribedTreatment: 'Continue Losartan 50mg once daily; home BP log',
    notes: 'Patient compliant with antihypertensive regimen.',
    recordedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'visits', 'visit_seed_1002'), {
    visitId: 'visit_seed_1002',
    patientId: 'PAT-2026-1002',
    visitDate: todayStr,
    symptoms: 'Routine 2nd trimester prenatal checkup, mild pedal fatigue',
    diagnosis: 'Normal intrauterine pregnancy, 24 weeks AOG',
    prescribedTreatment: 'Continue Ferrous Sulfate + Folic Acid 1 tab OD',
    notes: 'Encouraged adequate hydration and left lateral rest.',
    recordedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Vital Signs
  batch.set(doc(db, 'vitalSigns', 'vital_seed_1001'), {
    vitalId: 'vital_seed_1001',
    patientId: 'PAT-2026-1001',
    visitId: 'visit_seed_1001',
    bloodPressure: '132/84',
    temperature: 36.6,
    heartRate: 76,
    respiratoryRate: 18,
    weight: 71.5,
    height: 168,
    otherMeasurements: 'SpO2: 99%',
    notes: 'Seated resting reading after 5 minutes.',
    recordedBy: actor.uid,
    recordedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'vitalSigns', 'vital_seed_1002'), {
    vitalId: 'vital_seed_1002',
    patientId: 'PAT-2026-1002',
    visitId: 'visit_seed_1002',
    bloodPressure: '110/70',
    temperature: 36.8,
    heartRate: 82,
    respiratoryRate: 19,
    weight: 59.0,
    height: 158,
    otherMeasurements: 'FHT: 144 bpm',
    notes: 'Prenatal triage vitals nominal.',
    recordedBy: actor.uid,
    recordedAt: serverTimestamp(),
  });

  // Appointments (including tomorrow for FR-04)
  batch.set(doc(db, 'appointments', 'appt_seed_1001'), {
    appointmentId: 'appt_seed_1001',
    patientId: 'PAT-2026-1002',
    patientName: 'Clarissa Magbanua',
    appointmentDate: tomorrowStr,
    appointmentTime: '09:00',
    appointmentType: 'Prenatal Checkup',
    purpose: '2nd trimester prenatal follow-up and iron supplementation review',
    status: 'scheduled',
    notes: 'Bring maternity booklet.',
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'appointments', 'appt_seed_1002'), {
    appointmentId: 'appt_seed_1002',
    patientId: 'PAT-2026-1003',
    patientName: 'Roberto Tanghal',
    appointmentDate: tomorrowStr,
    appointmentTime: '10:30',
    appointmentType: 'Follow-up',
    purpose: 'Fasting blood glucose re-evaluation and medication refill',
    status: 'scheduled',
    notes: 'Instructed 8-hour fasting prior to visit.',
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'appointments', 'appt_seed_1003'), {
    appointmentId: 'appt_seed_1003',
    patientId: 'PAT-2026-1001',
    patientName: 'Mateo Villanueva',
    appointmentDate: todayStr,
    appointmentTime: '08:30',
    appointmentType: 'Consultation',
    purpose: 'Quarterly blood pressure review',
    status: 'completed',
    notes: 'Completed consultation.',
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Inventory Items & FEFO Batches (including expired & low stock test cases)
  batch.set(doc(db, 'inventory', 'item_paracetamol'), {
    itemId: 'item_paracetamol',
    itemName: 'Paracetamol 500mg Tablet',
    category: 'Analgesic / Antipyretic',
    description: 'Oral tablet for fever and mild pain management',
    unit: 'tablets',
    totalQuantity: 350,
    minimumStockLevel: 100,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'inventory', 'item_amoxicillin'), {
    itemId: 'item_amoxicillin',
    itemName: 'Amoxicillin 500mg Capsule',
    category: 'Antibiotic',
    description: 'Broad-spectrum oral beta-lactam antibiotic',
    unit: 'capsules',
    totalQuantity: 45,
    minimumStockLevel: 80,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'inventory', 'item_ferrous'), {
    itemId: 'item_ferrous',
    itemName: 'Ferrous Sulfate + Folic Acid',
    category: 'Maternal Supplement',
    description: 'Prenatal iron and folate supplementation',
    unit: 'tablets',
    totalQuantity: 240,
    minimumStockLevel: 100,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Batches for Paracetamol (1 expired batch that FEFO must skip + 1 near expiry + 1 later expiry)
  batch.set(doc(db, 'inventoryBatches', 'batch_para_exp'), {
    batchId: 'batch_para_exp',
    itemId: 'item_paracetamol',
    batchNumber: 'PCM-2401-EXP',
    quantityReceived: 50,
    remainingQuantity: 50,
    expirationDate: expiredStr,
    dateReceived: '2025-02-10',
    receivedBy: actor.uid,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'inventoryBatches', 'batch_para_early'), {
    batchId: 'batch_para_early',
    itemId: 'item_paracetamol',
    batchNumber: 'PCM-2603-A',
    quantityReceived: 120,
    remainingQuantity: 100,
    expirationDate: in30Str,
    dateReceived: todayStr,
    receivedBy: actor.uid,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'inventoryBatches', 'batch_para_late'), {
    batchId: 'batch_para_late',
    itemId: 'item_paracetamol',
    batchNumber: 'PCM-2608-B',
    quantityReceived: 200,
    remainingQuantity: 200,
    expirationDate: in180Str,
    dateReceived: todayStr,
    receivedBy: actor.uid,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'inventoryBatches', 'batch_amox_low'), {
    batchId: 'batch_amox_low',
    itemId: 'item_amoxicillin',
    batchNumber: 'AMX-2604-C',
    quantityReceived: 100,
    remainingQuantity: 45,
    expirationDate: in180Str,
    dateReceived: todayStr,
    receivedBy: actor.uid,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'inventoryBatches', 'batch_ferrous_1'), {
    batchId: 'batch_ferrous_1',
    itemId: 'item_ferrous',
    batchNumber: 'FEFA-2605-M',
    quantityReceived: 240,
    remainingQuantity: 240,
    expirationDate: in180Str,
    dateReceived: todayStr,
    receivedBy: actor.uid,
    createdAt: serverTimestamp(),
  });

  // Initial Inventory Transactions
  batch.set(doc(db, 'inventoryTransactions', 'tx_seed_1'), {
    transactionId: 'tx_seed_1',
    itemId: 'item_paracetamol',
    batchId: 'batch_para_early',
    transactionType: 'received',
    quantity: 120,
    previousQuantity: 0,
    newQuantity: 120,
    reason: 'Initial DOH clinic supply allocation',
    reference: 'DR-2026-081',
    performedBy: actor.uid,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'inventoryTransactions', 'tx_seed_2'), {
    transactionId: 'tx_seed_2',
    itemId: 'item_amoxicillin',
    batchId: 'batch_amox_low',
    transactionType: 'received',
    quantity: 100,
    previousQuantity: 0,
    newQuantity: 100,
    reason: 'Quarterly antibiotic stock receipt',
    reference: 'DR-2026-082',
    performedBy: actor.uid,
    timestamp: serverTimestamp(),
  });

  // Notifications
  batch.set(doc(db, 'notifications', 'notif_seed_lowstock'), {
    notificationId: 'notif_seed_lowstock',
    title: 'Low Stock Alert: Amoxicillin 500mg Capsule',
    message: 'Amoxicillin 500mg Capsule is at 45 capsules (below minimum threshold of 80 capsules).',
    notificationType: 'low_stock',
    recipientRoles: ['Administrative Clerk', 'Data Controller', 'Nurse'],
    recipientUserIds: [],
    relatedRecordId: 'item_amoxicillin',
    isRead: false,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'notifications', 'notif_seed_dup'), {
    notificationId: 'notif_seed_dup',
    title: 'Duplicate Review Required: Mateo Villanueva',
    message: 'Patient PAT-2026-1004 matched PAT-2026-1001 (same name and DOB 1984-05-14). Authorized staff review required.',
    notificationType: 'duplicate_review',
    recipientRoles: ['Data Controller', 'Doctor', 'Nurse', 'BHW'],
    recipientUserIds: [],
    relatedRecordId: 'PAT-2026-1004',
    isRead: false,
    createdAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'SAMPLE_DATA_SEED',
    affectedCollection: 'patients',
    affectedRecordId: 'PAT-2026-1001',
    description: 'Populated fictional development dataset for Ampayon Super Health Center.',
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed_dataset');
  }
}
