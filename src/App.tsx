import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Calendar,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldAlert,
  UserCog,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { PatientsView } from './components/PatientsView';
import { ClinicalRecordsView } from './components/ClinicalRecordsView';
import { AppointmentsView } from './components/AppointmentsView';
import { InventoryView } from './components/InventoryView';
import { NotificationsView } from './components/NotificationsView';
import { AuditLogsView } from './components/AuditLogsView';
import { StaffAccessView } from './components/StaffAccessView';
import { SettingsView } from './components/SettingsView';
import { subscribeAppointments } from './services/appointmentService';
import { subscribeStaffProfiles } from './services/authService';
import {
  subscribeInventoryBatches,
  subscribeInventoryItems,
  subscribeInventoryTransactions,
} from './services/inventoryService';
import { subscribeRoleNotifications } from './services/notificationService';
import { subscribePatients } from './services/patientService';
import type {
  Appointment,
  InventoryBatch,
  InventoryItem,
  InventoryTransaction,
  NavSection,
  Patient,
  StaffProfile,
  SystemNotification,
} from './types/caresync';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'clinical', label: 'Clinical Records', icon: Activity },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'inventory', label: 'Inventory (FEFO)', icon: Package },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'auditLogs', label: 'Audit Logs', icon: ShieldAlert },
  { id: 'staff', label: 'Staff & Access', icon: UserCog },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function CareSyncWorkspace() {
  const { firebaseUser, appUser, capabilities, loading, isOnline, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Core real-time Firestore streams
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatch[]>([]);
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransaction[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [quickOpenPatient, setQuickOpenPatient] = useState<Patient | null>(null);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !appUser || appUser.accountStatus !== 'active' || !capabilities) {
      setPatients([]);
      setAppointments([]);
      setInventoryItems([]);
      setInventoryBatches([]);
      setInventoryTransactions([]);
      setNotifications([]);
      setStaffProfiles([]);
      return;
    }

    const unsubs: (() => void)[] = [];
    unsubs.push(subscribePatients(setPatients));
    unsubs.push(subscribeAppointments(setAppointments));
    unsubs.push(subscribeInventoryItems(setInventoryItems));
    unsubs.push(subscribeInventoryBatches(setInventoryBatches));
    unsubs.push(subscribeRoleNotifications(appUser.role, setNotifications));
    unsubs.push(subscribeStaffProfiles(setStaffProfiles));

    if (appUser.role !== 'BHW') {
      unsubs.push(subscribeInventoryTransactions(setInventoryTransactions));
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [firebaseUser, appUser, capabilities]);

  // Ensure activeSection stays within user's allowed RBAC sections
  useEffect(() => {
    if (capabilities && !capabilities.allowedSections.includes(activeSection)) {
      setActiveSection('dashboard');
    }
  }, [capabilities, activeSection]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-4 w-36 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!firebaseUser || !firebaseUser.emailVerified || !appUser || appUser.accountStatus !== 'active' || !capabilities) {
    return <LoginView />;
  }

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    capabilities.allowedSections.includes(item.id)
  );

  const activeNavMeta = visibleNavItems.find((i) => i.id === activeSection) || visibleNavItems[0];

  const handleOpenPatientFromOutside = (patient: Patient) => {
    setQuickOpenPatient(patient);
    setActiveSection('patients');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Workspace Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Ampayon CareSync
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-slate-500"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="p-3 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'notifications' && unreadCount > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        isActive ? 'text-teal-100' : 'text-teal-700 font-semibold'
                      }`}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 truncate">{appUser.fullName}</p>
            <p className="text-slate-500 truncate">{appUser.role}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">Ampayon Super Health Center</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {activeNavMeta?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 whitespace-nowrap">
                <WifiOff className="w-3.5 h-3.5" />
                Offline Cache Mode
              </span>
            )}
            <span className="hidden md:inline text-xs text-slate-600 whitespace-nowrap">
              {appUser.fullName} · {appUser.role}
            </span>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView
              patients={patients}
              appointments={appointments}
              inventoryItems={inventoryItems}
              inventoryBatches={inventoryBatches}
              notifications={notifications}
              onNavigate={setActiveSection}
              onQuickOpenPatient={handleOpenPatientFromOutside}
            />
          )}

          {activeSection === 'patients' && (
            <PatientsView
              patients={patients}
              appointments={appointments}
              staffProfiles={staffProfiles}
              initialSelectedPatient={quickOpenPatient}
              onClearInitialSelected={() => setQuickOpenPatient(null)}
            />
          )}

          {activeSection === 'clinical' && (
            <ClinicalRecordsView
              patients={patients}
              onOpenPatientChart={handleOpenPatientFromOutside}
            />
          )}

          {activeSection === 'appointments' && (
            <AppointmentsView appointments={appointments} patients={patients} />
          )}

          {activeSection === 'inventory' && (
            <InventoryView
              items={inventoryItems}
              batches={inventoryBatches}
              transactions={inventoryTransactions}
            />
          )}

          {activeSection === 'notifications' && (
            <NotificationsView notifications={notifications} />
          )}

          {activeSection === 'auditLogs' && <AuditLogsView />}

          {activeSection === 'staff' && <StaffAccessView />}

          {activeSection === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CareSyncWorkspace />
      </AuthProvider>
    </ErrorBoundary>
  );
}
