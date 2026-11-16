import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, LogIn, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  registerWithEmailCredentials,
  resendVerificationEmail,
  sendAccountPasswordReset,
  signInWithEmailCredentials,
  signInWithGooglePopup,
} from '../services/authService';

export function LoginView() {
  const { firebaseUser, appUser, authError, refreshUserProfile, logout } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Sign-In failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      if (mode === 'signin') {
        await signInWithEmailCredentials(email, password);
      } else {
        if (fullName.trim().length < 2) {
          throw new Error('Please enter your full name (at least 2 characters).');
        }
        await registerWithEmailCredentials(fullName, email, password);
        setFeedback({
          type: 'info',
          text: 'Account created. Please check your inbox and verify your email address before signing in.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication error.';
      if (msg.includes('operation-not-allowed')) {
        setFeedback({
          type: 'error',
          text: 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method). Use Google Sign-In below or enable Email/Password in Firebase Console.',
        });
      } else {
        setFeedback({ type: 'error', text: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setFeedback({ type: 'error', text: 'Enter your email address first to receive a password reset link.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await sendAccountPasswordReset(email);
      setFeedback({
        type: 'info',
        text: `Password reset email sent to ${email.trim()}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to send reset email.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Case 1: Signed in via Email/Password but email not verified yet
  if (firebaseUser && !firebaseUser.emailVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-teal-700 text-white flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Verify Staff Email</h1>
              <p className="text-xs text-slate-500">Ampayon CareSync Security Policy</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            A verification link has been sent to <span className="font-medium text-slate-900">{firebaseUser.email}</span>.
            Firestore security rules require a verified email before clinical records can be accessed.
          </p>

          {feedback && (
            <div className="mb-4 p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
              {feedback.text}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void refreshUserProfile()}
              className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              I Verified My Email — Continue
            </button>
            <button
              type="button"
              onClick={async () => {
                await resendVerificationEmail(firebaseUser);
                setFeedback({ type: 'info', text: 'Verification email re-sent.' });
              }}
              className="w-full py-2 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-2 px-4 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              Sign out and switch account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Signed in and verified, but accountStatus is inactive (awaiting Data Controller activation)
  if (firebaseUser && appUser && appUser.accountStatus === 'inactive') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Account Pending Activation</h1>
              <p className="text-xs text-slate-500">Role-Based Access Control</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-slate-600 mb-6">
            <p>
              Your staff profile (<span className="font-medium text-slate-900">{appUser.email}</span>) has been registered
              with status <span className="font-mono text-amber-700 font-medium">inactive</span>.
            </p>
            <p>
              To protect patient privacy under least-privilege rules, a <span className="font-medium text-slate-900">Data Controller</span> must
              assign your clinical role and activate your account in <span className="font-medium">Staff &amp; Access</span>.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void refreshUserProfile()}
              className="flex-1 py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Check Status
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="py-2.5 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Left Clinical Context Column */}
        <div className="lg:col-span-5 bg-slate-900 text-slate-100 p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-teal-400 mb-2">
              Ampayon Super Health Center
            </p>
            <h1 className="text-2xl font-semibold text-white tracking-tight mb-4">
              Ampayon CareSync
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed mb-8">
              Unified healthcare information management for patient registration, longitudinal clinical records,
              FEFO medical supply tracking, and follow-up scheduling.
            </p>

            <div className="space-y-4 border-t border-slate-800 pt-6 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>Six role-enforced workspaces: Doctor, Nurse, BHW, Administrative Clerk, Data Controller, and Midwife</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>Duplicate patient detection with staff review confirmation and immutable audit logging</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>Offline-capable Firestore local cache with automatic reconnection synchronization</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-8">
            Authorized clinic staff authentication required.
          </p>
        </div>

        {/* Right Sign-In Column */}
        <div className="lg:col-span-7 p-8 lg:p-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">
              {mode === 'signin' ? 'Staff Sign In' : 'Register Staff Account'}
            </h2>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setFeedback(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'signin'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setFeedback(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {(feedback || authError) && (
            <div
              className={`mb-5 p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                feedback?.type === 'info'
                  ? 'bg-teal-50 border-teal-200 text-teal-900'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{feedback?.text || authError}</span>
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleGoogleSignIn()}
            className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2.5 mb-6"
          >
            <LogIn className="w-4 h-4 text-teal-700" />
            Continue with Google Workspace
          </button>

          <div className="relative flex items-center justify-center mb-6">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-xs text-slate-400 whitespace-nowrap">
              or use staff credentials
            </span>
            <div className="border-t border-slate-200 w-full" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Elena Reyes"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@ampayon-health.ph"
                  className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => void handlePasswordReset()}
                    className="text-xs text-teal-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting
                ? 'Authenticating...'
                : mode === 'signin'
                ? 'Sign In with Email'
                : 'Create Staff Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
