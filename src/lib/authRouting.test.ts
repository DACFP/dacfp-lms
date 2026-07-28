import { describe, expect, it } from 'vitest';
import {
  destinationAfterAuth,
  isPermittedReturnPath,
  roleHome,
} from './authRouting';

describe('auth routing', () => {
  it('uses actor role homes by default', () => {
    expect(roleHome('learner')).toBe('/');
    expect(roleHome('operator')).toBe('/admin');
    expect(destinationAfterAuth('learner', null)).toBe('/');
    expect(destinationAfterAuth('operator', null)).toBe('/admin');
  });

  it('accepts only same-actor permitted return paths', () => {
    expect(
      destinationAfterAuth('learner', {
        actor: 'learner',
        from: '/lesson/fpt-m2-video?replay=30',
      }),
    ).toBe('/lesson/fpt-m2-video?replay=30');
    expect(
      destinationAfterAuth('operator', {
        actor: 'operator',
        from: '/admin/learners',
      }),
    ).toBe('/admin/learners');
    expect(
      destinationAfterAuth('learner', {
        actor: 'operator',
        from: '/admin/learners',
      }),
    ).toBe('/');
    expect(
      destinationAfterAuth('operator', {
        actor: 'learner',
        from: '/lesson/fpt-m2-video',
      }),
    ).toBe('/admin');
  });

  it('rejects unknown, auth, and protocol-relative destinations', () => {
    expect(isPermittedReturnPath('learner', '/login')).toBe(false);
    expect(isPermittedReturnPath('learner', '/not-a-real-route')).toBe(false);
    expect(isPermittedReturnPath('learner', '//example.com/admin')).toBe(false);
    expect(isPermittedReturnPath('operator', '/dashboard')).toBe(false);
  });
});
