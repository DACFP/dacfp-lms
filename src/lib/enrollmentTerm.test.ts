import { describe, expect, it } from 'vitest';
import type { LmsEnrollment } from '../data/types';
import { remainingEnrollmentTerm } from './enrollmentTerm';

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

describe('enrollment-term display', () => {
  it('uses day granularity below 31 days', () => {
    const now = new Date('2026-07-27T00:00:00.000Z').getTime();
    expect(remainingEnrollmentTerm(enrollment, now)).toEqual({
      days: 12,
      headline: '12 days remaining',
      compact: '12 d',
    });
  });

  it('uses month granularity at 31 days and beyond', () => {
    const now = new Date('2026-07-08T00:00:00.000Z').getTime();
    expect(remainingEnrollmentTerm(enrollment, now)?.headline).toBe('1 month remaining');
  });

  it('returns no term when the enrollment has no expiry', () => {
    expect(remainingEnrollmentTerm({ ...enrollment, expires_at: null })).toBeNull();
  });
});
