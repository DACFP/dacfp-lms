import type { LmsEnrollment } from '../data/types';

const RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Renewal becomes visible for the final 30 days of the flagship enrollment,
 * through the instant that enrollment expires. The card still owns its own
 * actionability; this function answers visibility only.
 */
export function renewalWindowForEnrollment(enrollment: LmsEnrollment) {
  if (!enrollment.expires_at) return null;
  const closesAt = new Date(enrollment.expires_at).getTime();
  if (!Number.isFinite(closesAt)) return null;
  return {
    opensAt: closesAt - RENEWAL_WINDOW_MS,
    closesAt,
  };
}

export function isRenewalWindowOpen(
  enrollment: LmsEnrollment,
  now = Date.now(),
) {
  const window = renewalWindowForEnrollment(enrollment);
  return Boolean(
    window &&
      enrollment.status === 'active' &&
      now >= window.opensAt &&
      now <= window.closesAt,
  );
}
