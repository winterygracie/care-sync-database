# Ampayon CareSync — Firebase Setup & Integration Guide

## 1. Provisioned Firebase Project Configuration
The React frontend loads its Firebase project configuration from `/firebase-applet-config.json`:
- **Database ID**: Configured via `firebaseConfig.firestoreDatabaseId` (`ai-studio-09fa546c-0e61-4094-b4cb-eb4cf833c7be`)
- **Offline Persistence**: Enabled via `initializeFirestore(..., { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` so patient registration, vital signs, visits, and inventory lookups continue working during clinic connectivity drops and sync automatically upon reconnection.

## 2. Authentication Providers
- **Google Sign-In**: Pre-configured and ready immediately via `signInWithPopup`.
- **Email & Password Sign-In / Password Updates (FR-07 & FR-10)**:
  To enable staff email/password login and password reset flows in production:
  1. Open the [Firebase Console](https://console.firebase.google.com/) and select your project (`ethereal-experience-bpz3c`).
  2. Navigate to **Authentication → Sign-in method**.
  3. Enable **Email/Password** and save.
  4. Ensure new email/password users verify their email address before accessing protected clinical collections (`request.auth.token.email_verified == true` is enforced by `firestore.rules`).

## 3. Deploying Security Rules & Composite Indexes
```bash
firebase login
firebase use ethereal-experience-bpz3c
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## 4. Deploying Cloud Functions (Optional Server-Side Automation)
Client-side atomic Firestore transactions and batched writes already enforce FEFO dispensing, duplicate detection, low-stock alerts, next-day appointment reminder generation, and audit logging directly against Firestore. To also run scheduled background reminders and callable endpoints in Cloud Functions:
```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

## 5. Role-Based Access Control (6 System Roles)
- **Doctor**: Full patient profiles, medical records, visits, vital signs, appointments, inventory dispensing.
- **Nurse**: Assigned patient care, vital signs, clinical visits, appointments, inventory receiving & dispensing.
- **Barangay Health Worker (BHW)**: Patient registration, patient search, duplicate flagging, appointment visibility.
- **Administrative Clerk**: Appointment scheduling/updates, inventory receiving, stock adjustments, FEFO dispensing.
- **Data Controller**: System data management, user role/status administration, duplicate review, audit log oversight.
- **Midwife**: Patient profiles, maternal health notes, vital signs, visits, appointments, inventory dispensing.

## 6. Excluded Scope
Per project requirements, **Doctor Availability** and **Patient Queueing / Waiting Queue Management** are intentionally omitted from all collections, rules, and UI modules.
