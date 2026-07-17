import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RenewalEvent } from './RenewalEvent';
import type { LmsCourse, LmsEnrollment } from '../data/types';

const course: LmsCourse = {
  id: 'course-renewal-2026',
  slug: 'renewal-2026-sandbox',
  title: 'Renewal 2026 Sandbox',
  description: 'A one-module annual renewal course preview.',
  status: 'published',
  progression: 'sequential',
  prerequisite_course_id: null,
  ce_credits: 1,
  requires_terms_acceptance: false,
  created_at: '2026-01-01T00:00:00.000Z',
};

function enrollment(overrides: Partial<LmsEnrollment> = {}): LmsEnrollment {
  return {
    id: 'enrollment-renewal',
    person_email: 'learner@example.test',
    auth_user_id: 'auth-1',
    course_id: 'course-renewal-2026',
    source: 'synthetic',
    enrolled_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2027-07-16T23:59:59.000Z',
    status: 'active',
    terms_accepted_at: null,
    order_id: null,
    ...overrides,
  };
}

function renderEvent(props: Partial<React.ComponentProps<typeof RenewalEvent>> = {}) {
  return render(
    <MemoryRouter>
      <RenewalEvent
        course={course}
        enrollment={enrollment()}
        visible
        actionable
        resumePath="/course/renewal-2026-sandbox/module/1"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('RenewalEvent — SPEC-OVERHAUL §2b', () => {
  it('renders as a named event surface, not an anonymous card', () => {
    renderEvent();
    expect(screen.getByRole('heading', { name: 'Renewal 2026 Sandbox' })).toBeInTheDocument();
    expect(screen.getByText('Annual renewal')).toBeInTheDocument();
  });

  it('is governed entirely by the visibility prop, so promotion wiring is a prop change', () => {
    const { rerender } = renderEvent({ visible: false });
    expect(screen.queryByRole('heading', { name: 'Renewal 2026 Sandbox' })).toBeNull();

    // Same component, same enrollment — only the prop moves. This is the whole
    // point of §2b: entitlement is promotion's answer to give, not this
    // component's to infer.
    rerender(
      <MemoryRouter>
        <RenewalEvent
          course={course}
          enrollment={enrollment()}
          visible
          actionable
          resumePath="/course/renewal-2026-sandbox/module/1"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Renewal 2026 Sandbox' })).toBeInTheDocument();
  });

  it('states the window close date when one exists', () => {
    renderEvent();
    expect(screen.getByText(/Complete by Jul 16, 2027/)).toBeInTheDocument();
  });

  it('accepts an explicit window that overrides the enrollment expiry', () => {
    renderEvent({ window: { closes_at: '2026-12-31T23:59:59.000Z' } });
    expect(screen.getByText(/Complete by Dec 31, 2026/)).toBeInTheDocument();
  });

  it('falls back to undated copy rather than printing a null date', () => {
    renderEvent({ enrollment: enrollment({ expires_at: null }) });
    expect(
      screen.getByText('Complete your annual renewal to keep your learning access current.'),
    ).toBeInTheDocument();
  });

  it('withholds the action when it is not actionable', () => {
    renderEvent({ actionable: false });
    expect(screen.queryByRole('link', { name: /Start renewal/ })).toBeNull();
    expect(screen.getByText('Not available right now')).toBeInTheDocument();
  });
});
