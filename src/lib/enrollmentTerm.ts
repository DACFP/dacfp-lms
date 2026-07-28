import type { LmsEnrollment } from '../data/types';

const DAY_MS = 86_400_000;
const AVERAGE_MONTH_DAYS = 30.44;

export interface RemainingTerm {
  days: number;
  headline: string;
  compact: string;
}

export function remainingEnrollmentTerm(
  enrollment: LmsEnrollment,
  now = Date.now(),
): RemainingTerm | null {
  if (!enrollment.expires_at) return null;
  const expiry = new Date(enrollment.expires_at).getTime();
  if (!Number.isFinite(expiry)) return null;

  const days = Math.max(0, Math.ceil((expiry - now) / DAY_MS));
  if (days < 31) {
    return {
      days,
      headline: `${days} day${days === 1 ? '' : 's'} remaining`,
      compact: `${days} d`,
    };
  }

  const months = Math.max(1, Math.round(days / AVERAGE_MONTH_DAYS));
  return {
    days,
    headline: `${months} month${months === 1 ? '' : 's'} remaining`,
    compact: `${months} mo`,
  };
}
