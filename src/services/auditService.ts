import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
  type WriteBatch,
  type Transaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AppUser, AuditLog } from '../types/caresync';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export interface AuditPayload {
  actor: AppUser;
  actionType: string;
  affectedCollection: string;
  affectedRecordId: string;
  description: string;
}

export function attachAuditToBatch(batch: WriteBatch, payload: AuditPayload): string {
  const logId = makeId('log');
  const ref = doc(db, 'auditLogs', logId);
  batch.set(ref, {
    logId,
    userId: payload.actor.uid,
    userName: payload.actor.fullName.slice(0, 120),
    userRole: payload.actor.role,
    actionType: payload.actionType.slice(0, 80),
    affectedCollection: payload.affectedCollection.slice(0, 60),
    affectedRecordId: payload.affectedRecordId.slice(0, 128),
    description: payload.description.slice(0, 1000),
    timestamp: serverTimestamp(),
  });
  return logId;
}

export function attachAuditToTransaction(tx: Transaction, payload: AuditPayload): string {
  const logId = makeId('log');
  const ref = doc(db, 'auditLogs', logId);
  tx.set(ref, {
    logId,
    userId: payload.actor.uid,
    userName: payload.actor.fullName.slice(0, 120),
    userRole: payload.actor.role,
    actionType: payload.actionType.slice(0, 80),
    affectedCollection: payload.affectedCollection.slice(0, 60),
    affectedRecordId: payload.affectedRecordId.slice(0, 128),
    description: payload.description.slice(0, 1000),
    timestamp: serverTimestamp(),
  });
  return logId;
}

export function subscribeAuditLogs(
  onData: (logs: AuditLog[]) => void,
  maxRows = 200
): Unsubscribe {
  const path = 'auditLogs';
  const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(maxRows));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs = snapshot.docs.map((d) => d.data() as AuditLog);
      onData(logs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
