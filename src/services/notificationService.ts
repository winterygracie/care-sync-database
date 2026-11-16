import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { NotificationType, SystemNotification, SystemRole } from '../types/caresync';
import { makeId } from './auditService';

export interface CreateNotificationInput {
  notificationId?: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  recipientRoles: SystemRole[];
  recipientUserIds?: string[];
  relatedRecordId?: string;
}

export function attachNotificationToBatch(
  batch: WriteBatch,
  input: CreateNotificationInput
): string {
  const notificationId = input.notificationId || makeId('notif');
  batch.set(doc(db, 'notifications', notificationId), {
    notificationId,
    title: input.title.slice(0, 150),
    message: input.message.slice(0, 1000),
    notificationType: input.notificationType,
    recipientRoles: input.recipientRoles.slice(0, 6),
    recipientUserIds: (input.recipientUserIds || []).slice(0, 50),
    relatedRecordId: (input.relatedRecordId || '').slice(0, 128),
    isRead: false,
    createdAt: serverTimestamp(),
  });
  return notificationId;
}

export function subscribeRoleNotifications(
  role: SystemRole,
  onData: (notifications: SystemNotification[]) => void
): Unsubscribe {
  const path = 'notifications';
  const q =
    role === 'Data Controller'
      ? query(collection(db, path), orderBy('createdAt', 'desc'), limit(100))
      : query(
          collection(db, path),
          where('recipientRoles', 'array-contains', role),
          orderBy('createdAt', 'desc'),
          limit(100)
        );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as SystemNotification));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function markNotificationRead(notificationId: string, isRead = true): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
