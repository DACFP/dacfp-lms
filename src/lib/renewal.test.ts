import { describe, expect, it } from 'vitest';
import type { LmsEnrollment } from '../data/types';
import { isRenewalWindowOpen, renewalWindowForEnrollment } from './renewal';

const enrollment: LmsEnrollment = {
  id: 'enrollment-fpt',
  person_email: 'near-expiry@example.test',
  auth_user_id: 'auth-near-expiry',
  course_id: 'course-fpt',
  source: 'synthetic',
  enrolled_at: '2025-08-08T00:00:00.000Z',
  expires_at: '2026-08-08T00:00:00.000Z',
  status: 'active',
  terms_accepted_at: '2025-08-08T00:00:00.000Z',
  order_id: null,
};

describe('renewal window', () => {
  it('opens exactly 30 days before expiry and remains open through expiry', () => {
    const window = renewalWindowForEnrollment(enrollment)!;
    expect(isRenewalWindowOpen(enrollment, window.opensAt - 1)).toBe(false);
    expect(isRenewalWindowOpen(enrollment, window.opensAt)).toBe(true);
    expect(isRenewalWindowOpen(enrollment, window.closesAt)).toBe(true);
    expect(isRenewalWindowOpen(enrollment, window.closesAt + 1)).toBe(false);
  });

  it('stays hidden without an expiry or for a revoked enrollment', () => {
    expect(isRenewalWindowOpen({ ...enrollment, expires_at: null })).toBe(false);
    expect(isRenewalWindowOpen({ ...enrollment, status: 'revoked' })).toBe(false);
  });
});
