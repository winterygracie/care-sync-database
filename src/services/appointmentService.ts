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
import type { Appointment, AppointmentStatus, AppUser } from '../types/caresync';
import { attachAuditToBatch, makeId } from './auditService';
import { attachNotificationToBatch } from './notificationService';

export async function createAppointment(
  actor: AppUser,
  input: {
    patientId: string;
    patientName: string;
    appointmentDate: string;
    appointmentTime: string;
    appointmentType: string;
    purpose: string;
    notes: string;
  }
): Promise<string> {
  const appointmentId = makeId('appt');
  const batch = writeBatch(db);

  batch.set(doc(db, 'appointments', appointmentId), {
    appointmentId,
    patientId: input.patientId,
    patientName: input.patientName.trim().slice(0, 160),
    appointmentDate: input.appointmentDate,
    appointmentTime: input.appointmentTime.trim().slice(0, 10),
    appointmentType: input.appointmentType.trim().slice(0, 80),
    purpose: input.purpose.trim().slice(0, 500),
    status: 'scheduled',
    notes: input.notes.trim().slice(0, 1000),
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'APPOINTMENT_CREATE',
    affectedCollection: 'appointments',
    affectedRecordId: appointmentId,
    description: `Scheduled ${input.appointmentType} appointment for ${input.patientName} on ${input.appointmentDate} at ${input.appointmentTime}.`,
  });

  try {
    await batch.commit();
    return appointmentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `appointments/${appointmentId}`);
  }
}

export async function updateAppointment(
  actor: AppUser,
  existing: Appointment,
  updates: {
    appointmentDate: string;
    appointmentTime: string;
    appointmentType: string;
    purpose: string;
    status: AppointmentStatus;
    notes: string;
  }
): Promise<void> {
  const batch = writeBatch(db);

  batch.update(doc(db, 'appointments', existing.appointmentId), {
    appointmentDate: updates.appointmentDate,
    appointmentTime: updates.appointmentTime.trim().slice(0, 10),
    appointmentType: updates.appointmentType.trim().slice(0, 80),
    purpose: updates.purpose.trim().slice(0, 500),
    status: updates.status,
    notes: updates.notes.trim().slice(0, 1000),
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });

  attachAuditToBatch(batch, {
    actor,
    actionType: 'APPOINTMENT_UPDATE',
    affectedCollection: 'appointments',
    affectedRecordId: existing.appointmentId,
    description: `Updated appointment ${existing.appointmentId} (${existing.patientName}) status to ${updates.status} on ${updates.appointmentDate}.`,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `appointments/${existing.appointmentId}`);
  }
}

export function subscribeAppointments(onData: (appointments: Appointment[]) => void): Unsubscribe {
  const path = 'appointments';
  const q = query(
    collection(db, path),
    orderBy('appointmentDate', 'asc'),
    orderBy('appointmentTime', 'asc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as Appointment));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function generateNextDayFollowupNotifications(actor: AppUser): Promise<number> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  let snap;
  try {
    const q = query(
      collection(db, 'appointments'),
      where('status', '==', 'scheduled'),
      where('appointmentDate', '==', tomorrowStr)
    );
    snap = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'appointments');
  }

  if (snap.empty) return 0;

  const batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    const appt = d.data() as Appointment;
    const notifId = `followup_${appt.appointmentId}_${tomorrowStr}`;
    attachNotificationToBatch(batch, {
      notificationId: notifId,
      title: `Next-Day Follow-up: ${appt.patientName}`,
      message: `Scheduled ${appt.appointmentType} tomorrow (${tomorrowStr} at ${appt.appointmentTime}) — Purpose: ${appt.purpose}. Authorized staff should contact patient for confirmation.`,
      notificationType: 'appointment_followup',
      recipientRoles: ['Administrative Clerk', 'Nurse', 'BHW', 'Midwife', 'Doctor'],
      relatedRecordId: appt.appointmentId,
    });
    count++;
  }

  attachAuditToBatch(batch, {
    actor,
    actionType: 'FOLLOWUP_NOTIFICATIONS_GENERATE',
    affectedCollection: 'notifications',
    affectedRecordId: tomorrowStr,
    description: `Generated ${count} next-day follow-up reminder notification(s) for ${tomorrowStr}.`,
  });

  try {
    await batch.commit();
    return count;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'notifications');
  }
}
