import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LmsLearnerProfile } from '../data/types';
import { CertificateArtwork } from './CertificateArtwork';

const EXTREME_NAME = 'Alexandria Catherine-Montgomery Wellington-Harrington-Smythe the Third';

const profile: LmsLearnerProfile = {
  auth_user_id: 'auth-extreme-name',
  display_name: 'Extreme name',
  first_name: 'Alexandria',
  middle_name: 'Catherine-Montgomery',
  last_name: 'Wellington-Harrington-Smythe the Third',
  firm: 'Synthetic Advisory LLC',
  job_title: 'Financial Advisor',
  phone: null,
  firm_url: null,
  address: null,
  email: 'extreme-name@example.test',
  credential_ids: {},
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T00:00:00.000Z',
};

describe('CertificateArtwork', () => {
  let clientWidthDescriptor: PropertyDescriptor | undefined;
  let scrollWidthDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    scrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if (this.classList.contains('certificate-artwork')) return 1100;
        if (this.classList.contains('certificate-name-zone')) return 858;
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        if (!this.classList.contains('certificate-name')) return 0;
        const fontSize = Number.parseFloat(this.style.fontSize || '57.2');
        return Math.ceil((this.textContent?.length ?? 0) * fontSize * 0.62);
      },
    });
  });

  afterEach(() => {
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }
    if (scrollWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidthDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    }
  });

  it('keeps an extreme 60-plus-character name on one line with zero clipping', () => {
    expect(EXTREME_NAME.length).toBeGreaterThan(60);
    render(
      <CertificateArtwork
        profile={profile}
        completionDate="Dec 31, 2026"
        expirationDate="Dec 31, 2027"
      />,
    );

    const name = screen.getByText(EXTREME_NAME);
    const zone = name.parentElement;
    expect(zone).not.toBeNull();
    expect(name).toHaveAttribute('data-fit-status', 'fit');
    expect(name).toHaveAttribute('data-auto-fit', 'single-line');
    expect(name.scrollWidth).toBeLessThanOrEqual((zone?.clientWidth ?? 0) - 2);
    expect(Number.parseFloat(name.style.fontSize)).toBeLessThan(57.2);
  });

  it('preserves mixed-case certificate dates exactly', () => {
    render(
      <CertificateArtwork
        profile={profile}
        completionDate="Dec 31, 2026"
        expirationDate="Dec 31, 2027"
      />,
    );

    expect(screen.getByText('Dec 31, 2026')).toBeInTheDocument();
    expect(screen.getByText('Dec 31, 2027')).toBeInTheDocument();
  });
});
