import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, onSnapshotsInSync, waitForPendingWrites } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getRoleCapabilities, type RoleCapabilities } from '../lib/permissions';
import { ensureStaffUserRecord, signOutStaff } from '../services/authService';
import type { AppUser } from '../types/caresync';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  capabilities: RoleCapabilities | null;
  loading: boolean;
  authError: string | null;
  isOnline: boolean;
  isSynced: boolean;
  refreshUserProfile: () => Promise<void>;
  forceSyncPendingWrites: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSynced, setIsSynced] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubSync = onSnapshotsInSync(db, () => {
      setIsSynced(true);
    });
    return () => unsubSync();
  }, []);

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      setFirebaseUser(fbUser);
      setAuthError(null);

      if (!fbUser) {
        setAppUser(null);
        setLoading(false);
        return;
      }

      if (!fbUser.emailVerified) {
        setAppUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const ensured = await ensureStaffUserRecord(fbUser);
        setAppUser(ensured);

        const path = `users/${fbUser.uid}`;
        unsubUserDoc = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            if (snap.exists()) {
              setAppUser(snap.data() as AppUser);
            }
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, path);
          }
        );
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Failed to load staff profile.');
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  const refreshUserProfile = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const updated = auth.currentUser;
    setFirebaseUser(updated);
    if (updated.emailVerified) {
      const ensured = await ensureStaffUserRecord(updated);
      setAppUser(ensured);
    }
  };

  const forceSyncPendingWrites = async () => {
    setIsSynced(false);
    await waitForPendingWrites(db);
    setIsSynced(true);
  };

  const logout = async () => {
    await signOutStaff();
    setAppUser(null);
    setFirebaseUser(null);
  };

  const capabilities =
    appUser && appUser.accountStatus === 'active'
      ? getRoleCapabilities(appUser.role)
      : null;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        capabilities,
        loading,
        authError,
        isOnline,
        isSynced,
        refreshUserProfile,
        forceSyncPendingWrites,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return ctx;
}
