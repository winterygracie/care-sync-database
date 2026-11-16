import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/permissions';
import type { AccountStatus, AppUser, StaffProfile, SystemRole } from '../types/caresync';
import { attachAuditToBatch } from './auditService';

function sanitizeDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  const raw = (name || '').trim();
  if (raw.length >= 2) return raw.slice(0, 120);
  const emailPrefix = (email || '').split('@')[0]?.trim() || '';
  if (emailPrefix.length >= 2) return emailPrefix.slice(0, 120);
  return 'Clinic Staff';
}

export async function ensureStaffUserRecord(fbUser: FirebaseUser): Promise<AppUser> {
  const uid = fbUser.uid;
  const userPath = `users/${uid}`;
  const staffPath = `staffProfiles/${uid}`;
  const userRef = doc(db, 'users', uid);
  const staffRef = doc(db, 'staffProfiles', uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const isBootstrappedAdmin =
    fbUser.emailVerified &&
    fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  if (!existingSnap.exists()) {
    const initialRole: SystemRole = isBootstrappedAdmin ? 'Data Controller' : 'BHW';
    const initialStatus: AccountStatus = isBootstrappedAdmin ? 'active' : 'inactive';
    const fullName = sanitizeDisplayName(fbUser.displayName, fbUser.email);
    const email = (fbUser.email || '').slice(0, 180);

    try {
      const batch = writeBatch(db);
      batch.set(userRef, {
        uid,
        fullName,
        email,
        role: initialRole,
        accountStatus: initialStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });
      batch.set(staffRef, {
        uid,
        fullName,
        role: initialRole,
        accountStatus: initialStatus,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }

    try {
      const createdSnap = await getDoc(userRef);
      return createdSnap.data() as AppUser;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, userPath);
    }
  }

  const existingUser = existingSnap.data() as AppUser;
  try {
    const batch = writeBatch(db);
    batch.update(userRef, {
      lastLogin: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const staffSnap = await getDoc(staffRef);
    if (!staffSnap.exists()) {
      batch.set(staffRef, {
        uid,
        fullName: existingUser.fullName,
        role: existingUser.role,
        accountStatus: existingUser.accountStatus,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, staffPath);
  }

  return existingUser;
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signInWithEmailCredentials(email: string, password: string): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function registerWithEmailCredentials(
  fullName: string,
  email: string,
  password: string
): Promise<FirebaseUser> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: fullName.trim().slice(0, 120) });
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function resendVerificationEmail(fbUser: FirebaseUser): Promise<void> {
  await sendEmailVerification(fbUser);
}

export async function signOutStaff(): Promise<void> {
  await signOut(auth);
}

export async function updateOwnProfileName(actor: AppUser, fullName: string): Promise<void> {
  const cleanName = fullName.trim().slice(0, 120);
  if (cleanName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }

  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: cleanName });
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', actor.uid), {
    fullName: cleanName,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'staffProfiles', actor.uid), {
    fullName: cleanName,
    updatedAt: serverTimestamp(),
  });
  attachAuditToBatch(batch, {
    actor: { ...actor, fullName: cleanName },
    actionType: 'USER_PROFILE_UPDATE',
    affectedCollection: 'users',
    affectedRecordId: actor.uid,
    description: `Updated own profile display name to "${cleanName}".`,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${actor.uid}`);
  }
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('No authenticated email account found.');
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function sendAccountPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function updateUserRoleAndStatus(
  actor: AppUser,
  targetUser: AppUser,
  newRole: SystemRole,
  newStatus: AccountStatus
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', targetUser.uid), {
    role: newRole,
    accountStatus: newStatus,
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(db, 'staffProfiles', targetUser.uid),
    {
      uid: targetUser.uid,
      fullName: targetUser.fullName,
      role: newRole,
      accountStatus: newStatus,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  attachAuditToBatch(batch, {
    actor,
    actionType: 'USER_ACCESS_UPDATE',
    affectedCollection: 'users',
    affectedRecordId: targetUser.uid,
    description: `Updated ${targetUser.fullName} (${targetUser.email}) role to ${newRole} and status to ${newStatus}.`,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export function subscribeAllUsers(onData: (users: AppUser[]) => void): Unsubscribe {
  const path = 'users';
  const q = query(collection(db, path), orderBy('fullName', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as AppUser));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeStaffProfiles(onData: (profiles: StaffProfile[]) => void): Unsubscribe {
  const path = 'staffProfiles';
  const q = query(collection(db, path), orderBy('fullName', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as StaffProfile));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function syncLastLogin(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      lastLogin: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
