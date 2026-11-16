import type { NavSection, SystemRole } from '../types/caresync';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'gracecarmelcupin@gmail.com';

export interface RoleCapabilities {
  canViewPatients: boolean;
  canRegisterPatients: boolean;
  canEditPatients: boolean;
  canReviewDuplicates: boolean;
  canViewClinicalRecords: boolean;
  canEditMedicalRecords: boolean;
  canRecordVisits: boolean;
  canRecordVitals: boolean;
  canViewAppointments: boolean;
  canManageAppointments: boolean;
  canOverrideTerminalAppointments: boolean;
  canViewInventory: boolean;
  canReceiveInventory: boolean;
  canDispenseInventory: boolean;
  canAdjustInventory: boolean;
  canViewAuditLogs: boolean;
  canManageUsers: boolean;
  allowedSections: NavSection[];
  dashboardLabel: string;
  dashboardDescription: string;
}

export const ROLE_CAPABILITIES: Record<SystemRole, RoleCapabilities> = {
  Doctor: {
    canViewPatients: true,
    canRegisterPatients: true,
    canEditPatients: true,
    canReviewDuplicates: true,
    canViewClinicalRecords: true,
    canEditMedicalRecords: true,
    canRecordVisits: true,
    canRecordVitals: true,
    canViewAppointments: true,
    canManageAppointments: true,
    canOverrideTerminalAppointments: false,
    canViewInventory: true,
    canReceiveInventory: false,
    canDispenseInventory: true,
    canAdjustInventory: false,
    canViewAuditLogs: false,
    canManageUsers: false,
    allowedSections: [
      'dashboard',
      'patients',
      'clinical',
      'appointments',
      'inventory',
      'notifications',
      'settings',
    ],
    dashboardLabel: 'Physician Clinical Workspace',
    dashboardDescription:
      'Review longitudinal medical records, record consultations and diagnoses, dispense supplies via FEFO, and oversee duplicate patient flags.',
  },
  Nurse: {
    canViewPatients: true,
    canRegisterPatients: true,
    canEditPatients: true,
    canReviewDuplicates: true,
    canViewClinicalRecords: true,
    canEditMedicalRecords: true,
    canRecordVisits: true,
    canRecordVitals: true,
    canViewAppointments: true,
    canManageAppointments: true,
    canOverrideTerminalAppointments: false,
    canViewInventory: true,
    canReceiveInventory: true,
    canDispenseInventory: true,
    canAdjustInventory: true,
    canViewAuditLogs: false,
    canManageUsers: false,
    allowedSections: [
      'dashboard',
      'patients',
      'clinical',
      'appointments',
      'inventory',
      'notifications',
      'settings',
    ],
    dashboardLabel: 'Nursing Care & Triage',
    dashboardDescription:
      'Capture vital signs, coordinate follow-up appointments, assist clinical visits, and monitor supply batches.',
  },
  BHW: {
    canViewPatients: true,
    canRegisterPatients: true,
    canEditPatients: true,
    canReviewDuplicates: true,
    canViewClinicalRecords: false,
    canEditMedicalRecords: false,
    canRecordVisits: false,
    canRecordVitals: false,
    canViewAppointments: true,
    canManageAppointments: false,
    canOverrideTerminalAppointments: false,
    canViewInventory: true,
    canReceiveInventory: false,
    canDispenseInventory: false,
    canAdjustInventory: false,
    canViewAuditLogs: false,
    canManageUsers: false,
    allowedSections: [
      'dashboard',
      'patients',
      'appointments',
      'inventory',
      'notifications',
      'settings',
    ],
    dashboardLabel: 'Community Health Registration',
    dashboardDescription:
      'Register Barangay Ampayon patients digitally, verify potential duplicate profiles, and coordinate community follow-up schedules.',
  },
  'Administrative Clerk': {
    canViewPatients: true,
    canRegisterPatients: true,
    canEditPatients: false,
    canReviewDuplicates: false,
    canViewClinicalRecords: false,
    canEditMedicalRecords: false,
    canRecordVisits: false,
    canRecordVitals: false,
    canViewAppointments: true,
    canManageAppointments: true,
    canOverrideTerminalAppointments: false,
    canViewInventory: true,
    canReceiveInventory: true,
    canDispenseInventory: true,
    canAdjustInventory: true,
    canViewAuditLogs: false,
    canManageUsers: false,
    allowedSections: [
      'dashboard',
      'patients',
      'appointments',
      'inventory',
      'notifications',
      'settings',
    ],
    dashboardLabel: 'Front Desk & Supply Operations',
    dashboardDescription:
      'Schedule and manage appointments, generate next-day follow-up reminders, receive medical batches, and manage FEFO stock.',
  },
  'Data Controller': {
    canViewPatients: true,
    canRegisterPatients: true,
    canEditPatients: true,
    canReviewDuplicates: true,
    canViewClinicalRecords: true,
    canEditMedicalRecords: true,
    canRecordVisits: true,
    canRecordVitals: true,
    canViewAppointments: true,
    canManageAppointments: true,
    canOverrideTerminalAppointments: true,
    canViewInventory: true,
    canReceiveInventory: true,
    canDispenseInventory: true,
    canAdjustInventory: true,
    canViewAuditLogs: true,
    canManageUsers: true,
    allowedSections: [
      'dashboard',
      'patients',
      'clinical',
      'appointments',
      'inventory',
      'notifications',
      'auditLogs',
      'staff',
      'settings',
    ],
    dashboardLabel: 'System Governance & Data Control',
    dashboardDescription:
      'Administer user roles and account status, audit immutable system activity logs, and resolve flagged duplicate patient records.',
  },
  Midwife: {
    canViewPatients: true,
    canRegisterPatients: true,
    canEditPatients: true,
    canReviewDuplicates: false,
    canViewClinicalRecords: true,
    canEditMedicalRecords: true,
    canRecordVisits: true,
    canRecordVitals: true,
    canViewAppointments: true,
    canManageAppointments: true,
    canOverrideTerminalAppointments: false,
    canViewInventory: true,
    canReceiveInventory: false,
    canDispenseInventory: true,
    canAdjustInventory: false,
    canViewAuditLogs: false,
    canManageUsers: false,
    allowedSections: [
      'dashboard',
      'patients',
      'clinical',
      'appointments',
      'inventory',
      'notifications',
      'settings',
    ],
    dashboardLabel: 'Maternal & Reproductive Care',
    dashboardDescription:
      'Manage maternal health records, prenatal vital signs, patient visits, and scheduled maternal follow-ups.',
  },
};

export function getRoleCapabilities(role: SystemRole): RoleCapabilities {
  return ROLE_CAPABILITIES[role];
}
