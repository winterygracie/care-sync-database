import React, { useState } from 'react';
import { RefreshCw, ShieldCheck, User, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { firebaseProjectConfig } from '../lib/firebase';
import { formatTimestamp } from '../lib/formatters';
import {
  changeOwnPassword,
  sendAccountPasswordReset,
  updateOwnProfileName,
} from '../services/authService';

export function SettingsView() {
  const {
    appUser,
    firebaseUser,
    isOnline,
    isSynced,
    forceSyncPendingWrites,
  } = useAuth();

  const [fullName, setFullName] = useState(appUser?.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!appUser || !firebaseUser) return null;

  const usesPasswordProvider = firebaseUser.providerData.some(
    (p) => p.providerId === 'password'
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await updateOwnProfileName(appUser, fullName);
      setFeedback({ type: 'ok', text: 'Profile display name updated.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setFeedback({ type: 'ok', text: 'Account password updated.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Password update failed.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendResetEmail = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await sendAccountPasswordReset(appUser.email);
      setFeedback({
        type: 'ok',
        text: `Password setup/reset email sent to ${appUser.email}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to send reset email.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      await forceSyncPendingWrites();
      setFeedback({
        type: 'ok',
        text: 'All local offline writes are synchronized with Cloud Firestore.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Sync check failed.',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Account &amp; Offline Sync Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your profile details, authentication credentials, and Firestore offline persistence.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Profile Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <User className="w-4 h-4 text-teal-700" />
          <h3 className="text-base font-semibold text-slate-900">Staff Profile</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pb-2">
          <div>
            <span className="text-slate-500 block">Assigned Role</span>
            <span className="font-medium text-slate-900 text-sm">{appUser.role}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Email Address</span>
            <span className="font-medium text-slate-900 text-sm">{appUser.email}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Last Login</span>
            <span className="font-mono tabular-nums text-slate-800 text-sm">
              {formatTimestamp(appUser.lastLogin)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Display Full Name
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
          >
            Update Profile
          </button>
        </form>
      </div>

      {/* Password & Credential Flow */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldCheck className="w-4 h-4 text-teal-700" />
          <h3 className="text-base font-semibold text-slate-900">Password &amp; Security</h3>
        </div>

        {usesPasswordProvider ? (
          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between gap-4">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
              >
                Change Password
              </button>
              <button
                type="button"
                onClick={() => void handleSendResetEmail()}
                className="text-xs text-teal-700 hover:underline"
              >
                Send reset link via email instead
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-slate-600">
              Signed in via Google Workspace OAuth. You can also send a Firebase password setup/reset link to{' '}
              <span className="font-medium text-slate-900">{appUser.email}</span> if Email/Password login is enabled in Firebase Console.
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSendResetEmail()}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg whitespace-nowrap shrink-0"
            >
              Send Password Setup Email
            </button>
          </div>
        )}
      </div>

      {/* Offline Persistence & Firebase Config */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-700" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-700" />
            )}
            <h3 className="text-base font-semibold text-slate-900">
              Offline Persistence &amp; Firestore Connection
            </h3>
          </div>

          <button
            type="button"
            disabled={syncing || !isOnline}
            onClick={() => void handleManualSync()}
            className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Verify Pending Sync
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Network &amp; Cache Status</span>
            <span className="font-medium text-slate-900">
              {isOnline ? 'Online' : 'Offline Mode (Local IndexedDB Cache Active)'} ·{' '}
              {isSynced ? 'Snapshots In Sync' : 'Pending Write Sync'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Connected Firestore Database</span>
            <span className="font-mono text-slate-800">
              {firebaseProjectConfig.projectId} / {firebaseProjectConfig.firestoreDatabaseId}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
