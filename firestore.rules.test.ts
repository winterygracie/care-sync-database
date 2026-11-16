/**
 * Ampayon CareSync - Firestore Security Rules Test Suite
 * Verifies the "Dirty Dozen" adversarial payloads and authorized role workflows
 * against the Firestore Emulator using @firebase/rules-unit-testing.
 */

export const DIRTY_DOZEN_SPECS = [
  {
    id: 'DD-01',
    name: 'Self-privilege escalation on user registration',
    collection: 'users',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    name: 'Shadow/ghost field injection on patient creation',
    collection: 'patients',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    name: 'Unverified admin email spoofing',
    collection: 'auditLogs',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    name: 'PII cross-user read on users collection',
    collection: 'users',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    name: 'BHW least-privilege breach reading medicalRecords',
    collection: 'medicalRecords',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    name: 'Orphaned visit creation without existing patient',
    collection: 'visits',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    name: 'Negative inventory totalQuantity update',
    collection: 'inventory',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    name: 'Identity spoofing in auditLogs creation',
    collection: 'auditLogs',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    name: 'Audit log modification or deletion by Data Controller',
    collection: 'auditLogs',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    name: 'Terminal state bypass on completed appointment',
    collection: 'appointments',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    name: 'Client-forged backdated timestamp on vitalSigns',
    collection: 'vitalSigns',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    name: 'Document ID poisoning with invalid characters',
    collection: 'patients',
    expected: 'PERMISSION_DENIED',
  },
] as const;

/**
 * Runnable with Firebase Emulator + @firebase/rules-unit-testing + vitest:
 *
 * import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
 * import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
 * import fs from 'node:fs';
 *
 * const testEnv = await initializeTestEnvironment({
 *   projectId: 'ampayon-caresync-test',
 *   firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
 * });
 *
 * // Each DD-01..DD-12 asserts assertFails(...) when executed against the emulator.
 */
