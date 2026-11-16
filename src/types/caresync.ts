import type { Timestamp } from 'firebase/firestore';

export type SystemRole =
  | 'Doctor'
  | 'Nurse'
  | 'BHW'
  | 'Administrative Clerk'
  | 'Data Controller'
  | 'Midwife';

export const SYSTEM_ROLES: SystemRole[] = [
  'Doctor',
  'Nurse',
  'BHW',
  'Administrative Clerk',
  'Data Controller',
  'Midwife',
];

export type AccountStatus = 'active' | 'inactive';

export interface AppUser {
  uid: string;
  fullName: string;
  email: string;
  role: SystemRole;
  accountStatus: AccountStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  lastLogin: Timestamp | null;
}

export interface StaffProfile {
  uid: string;
  fullName: string;
  role: SystemRole;
  accountStatus: AccountStatus;
  updatedAt: Timestamp | null;
}

export type DuplicateStatus =
  | 'clear'
  | 'flagged'
  | 'confirmed_unique'
  | 'confirmed_duplicate';

export interface Patient {
  patientId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  normalizedKey: string;
  dateOfBirth: string;
  sex: 'Male' | 'Female' | 'Other';
  address: string;
  contactNumber: string;
  emergencyContact: string;
  registrationDate: string;
  registeredBy: string;
  duplicateStatus: DuplicateStatus;
  possibleDuplicateOf: string[];
  duplicateReviewedBy: string;
  duplicateReviewedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  hasPendingWrites?: boolean;
}

export interface MedicalRecord {
  recordId: string;
  patientId: string;
  medicalConditions: string;
  allergies: string;
  medications: string;
  medicalHistory: string;
  maternalHealthNotes: string;
  notes: string;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Visit {
  visitId: string;
  patientId: string;
  visitDate: string;
  symptoms: string;
  diagnosis: string;
  prescribedTreatment: string;
  notes: string;
  recordedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface VitalSign {
  vitalId: string;
  patientId: string;
  visitId: string;
  bloodPressure: string;
  temperature: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  weight: number | null;
  height: number | null;
  otherMeasurements: string;
  notes: string;
  recordedBy: string;
  recordedAt: Timestamp | null;
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'missed';

export interface Appointment {
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  appointmentType: string;
  purpose: string;
  status: AppointmentStatus;
  notes: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface InventoryItem {
  itemId: string;
  itemName: string;
  category: string;
  description: string;
  unit: string;
  totalQuantity: number;
  minimumStockLevel: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface InventoryBatch {
  batchId: string;
  itemId: string;
  batchNumber: string;
  quantityReceived: number;
  remainingQuantity: number;
  expirationDate: string;
  dateReceived: string;
  receivedBy: string;
  createdAt: Timestamp | null;
}

export type InventoryTransactionType = 'received' | 'dispensed' | 'stock_adjustment';

export interface InventoryTransaction {
  transactionId: string;
  itemId: string;
  batchId: string;
  transactionType: InventoryTransactionType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  reference: string;
  performedBy: string;
  timestamp: Timestamp | null;
}

export type NotificationType =
  | 'appointment_followup'
  | 'low_stock'
  | 'duplicate_review'
  | 'system';

export interface SystemNotification {
  notificationId: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  recipientRoles: SystemRole[];
  recipientUserIds: string[];
  relatedRecordId: string;
  isRead: boolean;
  createdAt: Timestamp | null;
}

export interface AuditLog {
  logId: string;
  userId: string;
  userName: string;
  userRole: SystemRole;
  actionType: string;
  affectedCollection: string;
  affectedRecordId: string;
  description: string;
  timestamp: Timestamp | null;
}

export type NavSection =
  | 'dashboard'
  | 'patients'
  | 'clinical'
  | 'appointments'
  | 'inventory'
  | 'notifications'
  | 'auditLogs'
  | 'staff'
  | 'settings';
