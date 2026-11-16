import type { Timestamp } from 'firebase/firestore';

export function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Pending sync';
  try {
    const d = ts.toDate();
    return d.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function calculateAge(dobStr: string): string {
  if (!dobStr) return '—';
  const dob = new Date(`${dobStr}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return '—';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return `${Math.max(0, age)} yrs`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function isExpiredDate(dateStr: string): boolean {
  if (!dateStr) return false;
  return dateStr < todayIsoDate();
}

export function isExpiringSoon(dateStr: string, withinDays = 45): boolean {
  if (!dateStr) return false;
  const today = todayIsoDate();
  if (dateStr < today) return false;
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  return dateStr <= limit.toISOString().slice(0, 10);
}
