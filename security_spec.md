# Ampayon CareSync — Firestore Security Specification

## 1. Data Invariants

1. **Identity & Privilege Invariant**: Roles (`Doctor`, `Nurse`, `BHW`, `Administrative Clerk`, `Data Controller`, `Midwife`) and `accountStatus` (`active`, `inactive`) reside exclusively in `/users/{uid}` and `/staffProfiles/{uid}`. Users cannot self-assign `Data Controller` or `Doctor` roles or activate themselves during registration; only the bootstrapped administrator (`gracecarmelcupin@gmail.com` with `email_verified == true`) or an active `Data Controller` can modify roles or account status.
2. **Email Verification Gate**: All authenticated reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation**: `/users/{uid}` (containing staff `email`) is readable only by the owning user (`uid == request.auth.uid`), an active `Data Controller`, or the bootstrapped administrator. Non-PII display names and roles are stored in `/staffProfiles/{uid}`.
4. **Clinical Confidentiality (Least Privilege)**: `/medicalRecords`, `/visits`, and `/vitalSigns` are readable and writable only by clinical staff (`Doctor`, `Nurse`, `Midwife`) and `Data Controller`. `BHW` and `Administrative Clerk` are denied read/write access to clinical diagnoses, allergies, and visit notes.
5. **Relational Integrity**: Every `medicalRecords`, `visits`, `vitalSigns`, and `appointments` document must reference an existing `/patients/{patientId}` document via `exists()` on creation, and `patientId` is immutable on update.
6. **Inventory Non-Negativity & Immutability**: `/inventory.totalQuantity >= 0` and `/inventoryBatches.remainingQuantity >= 0 && <= quantityReceived`. `/inventoryTransactions` are append-only (`update` and `delete` denied for all users).
7. **Terminal State Locking**: Appointments with `status` in `['completed', 'cancelled']` cannot be modified by non-controllers; only `Data Controller` can override terminal states.
8. **Audit Log Immutability**: `/auditLogs` records require `userId == request.auth.uid` and `timestamp == request.time` on creation, are readable only by `Data Controller` or bootstrapped admin, and `update`/`delete` are unconditionally denied (`false`).
9. **Temporal Integrity**: `createdAt`, `updatedAt`, `recordedAt`, and `timestamp` must equal `request.time` on writes, and `createdAt` is immutable on updates.
10. **Path & Payload Hygiene**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and every string and array field enforces strict `.size()` bounds.

---

## 2. The "Dirty Dozen" Adversarial Payloads

### Payload 1: Self-Privilege Escalation on User Registration (`/users/attacker_uid`)
```json
{
  "uid": "attacker_uid",
  "fullName": "Mallory Attacker",
  "email": "mallory@example.com",
  "role": "Data Controller",
  "accountStatus": "active",
  "createdAt": "<request.time>",
  "updatedAt": "<request.time>",
  "lastLogin": "<request.time>"
}
```
- **Expected**: `PERMISSION_DENIED` (self-registration allows only `role == "BHW"` and `accountStatus == "inactive"`).

### Payload 2: Ghost / Shadow Field Injection on Patient Creation (`/patients/PAT-999`)
```json
{
  "patientId": "PAT-999",
  "firstName": "Juan",
  "middleName": "",
  "lastName": "Dela Cruz",
  "normalizedKey": "juan|dela cruz|1990-01-01",
  "dateOfBirth": "1990-01-01",
  "sex": "Male",
  "address": "Barangay Ampayon",
  "contactNumber": "09170000000",
  "emergencyContact": "Maria Dela Cruz",
  "registrationDate": "2026-11-15",
  "registeredBy": "bhw_uid",
  "duplicateStatus": "clear",
  "possibleDuplicateOf": [],
  "duplicateReviewedBy": "",
  "createdAt": "<request.time>",
  "updatedAt": "<request.time>",
  "isVerifiedOverride": true
}
```
- **Expected**: `PERMISSION_DENIED` (`keys().hasOnly(...)` rejects unknown field `isVerifiedOverride`).

### Payload 3: Unverified Email Spoofing Admin Email
- Auth context: `{ uid: "spoof_1", token: { email: "gracecarmelcupin@gmail.com", email_verified: false } }`
- Operation: Read `/auditLogs` or update `/users/any_uid`.
- **Expected**: `PERMISSION_DENIED` (`email_verified == true` is strictly required).

### Payload 4: PII Cross-User Read on `/users/{otherUid}`
- Auth context: Active `Nurse` (`uid: "nurse_1"`, `email_verified: true`)
- Operation: `get(/users/doctor_1)`
- **Expected**: `PERMISSION_DENIED` (only owner, `Data Controller`, or bootstrapped admin can read `/users/{uid}`).

### Payload 5: Least-Privilege Breach — BHW Reading `/medicalRecords/{recordId}`
- Auth context: Active `BHW` (`uid: "bhw_1"`, `email_verified: true`)
- Operation: `get(/medicalRecords/rec_001)` or `list(/medicalRecords)`
- **Expected**: `PERMISSION_DENIED` (`BHW` cannot access sensitive medical records).

### Payload 6: Orphaned Visit Creation (`/visits/visit_orphan`)
```json
{
  "visitId": "visit_orphan",
  "patientId": "NON_EXISTENT_PATIENT",
  "visitDate": "2026-11-15",
  "symptoms": "Fever",
  "diagnosis": "Viral syndrome",
  "prescribedTreatment": "Paracetamol",
  "notes": "",
  "recordedBy": "doctor_1",
  "createdAt": "<request.time>",
  "updatedAt": "<request.time>"
}
```
- **Expected**: `PERMISSION_DENIED` (`exists(/databases/$(database)/documents/patients/NON_EXISTENT_PATIENT)` fails).

### Payload 7: Negative Inventory Quantity (`/inventory/item_001`)
```json
{
  "totalQuantity": -5,
  "updatedAt": "<request.time>"
}
```
- **Expected**: `PERMISSION_DENIED` (`totalQuantity >= 0` invariant rejects negative stock).

### Payload 8: Identity Spoofing in Audit Log (`/auditLogs/log_spoof`)
```json
{
  "logId": "log_spoof",
  "userId": "doctor_1",
  "userName": "Dr. Santos",
  "userRole": "Doctor",
  "actionType": "DISPENSE",
  "affectedCollection": "inventory",
  "affectedRecordId": "item_001",
  "description": "Forged log entry",
  "timestamp": "<request.time>"
}
```
- Auth context: `uid: "clerk_1"`
- **Expected**: `PERMISSION_DENIED` (`userId == request.auth.uid` enforced).

### Payload 9: Audit Log Tampering (`update` or `delete` on `/auditLogs/log_001`)
- Auth context: Active `Data Controller`
- Operation: `delete(/auditLogs/log_001)` or `update(/auditLogs/log_001, { description: "Edited" })`
- **Expected**: `PERMISSION_DENIED` (`auditLogs` updates and deletes are unconditionally `false`).

### Payload 10: Terminal State Bypass on Completed Appointment (`/appointments/appt_001`)
- Existing doc: `{ status: "completed", ... }`
- Auth context: Active `Administrative Clerk`
- Operation: `update({ status: "scheduled", updatedBy: "clerk_1", updatedAt: "<request.time>" })`
- **Expected**: `PERMISSION_DENIED` (completed/cancelled appointments are locked for non-controllers).

### Payload 11: Client-Forged Timestamp on Vital Signs (`/vitalSigns/vital_forged`)
```json
{
  "vitalId": "vital_forged",
  "patientId": "PAT-2026-0001",
  "visitId": "",
  "bloodPressure": "120/80",
  "temperature": 36.8,
  "heartRate": 75,
  "respiratoryRate": 18,
  "weight": 62,
  "height": 165,
  "otherMeasurements": "",
  "notes": "",
  "recordedBy": "nurse_1",
  "recordedAt": "2020-01-01T00:00:00Z"
}
```
- **Expected**: `PERMISSION_DENIED` (`recordedAt == request.time` rejects backdated timestamps).

### Payload 12: Path ID Poisoning (`/patients/invalid id with spaces and $$$`)
- Operation: `setDoc(doc(db, 'patients', 'invalid id $$$'), ...)`
- **Expected**: `PERMISSION_DENIED` (`isValidId(patientId)` rejects invalid ID characters).
