import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RouteFocus } from './RouteFocus';
import { StatusAnnouncer, useStatusAnnouncer } from './StatusAnnouncer';
import { TermsModal } from './TermsModal';
import { AuthSessionProvider } from '../context/AuthContext';
import type { LmsAuthProvider } from '../data/provider';
import type { LmsCourse, LmsEnrollment } from '../data/types';
import { LoginPage } from '../pages/AuthPages';

/**
 * Gate evidence for SPEC-OVERHAUL.md §1 "Accessibility infrastructure".
 * These assert the behaviours the brief names (#10 focus trap / initial focus /
 * inert background / scroll lock, #11 route-change focus, #12 switcher, #3
 * live region + focus move) rather than reporting them.
 */

const course: LmsCourse = {
  id: 'course-fpt',
  slug: 'fpt-sandbox',
  title: 'FPT Sandbox',
  description: 'Synthetic course.',
  status: 'published',
  progression: 'sequential',
  prerequisite_course_id: null,
  ce_credits: 10,
  requires_terms_acceptance: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

const enrollment: LmsEnrollment = {
  id: 'enrollment-1',
  person_email: 'fresh@example.test',
  auth_user_id: 'auth-fresh',
  course_id: 'course-fpt',
  source: 'manual',
  enrolled_at: '2026-01-01T00:00:00.000Z',
  expires_at: null,
  status: 'active',
  terms_accepted_at: null,
  order_id: null,
};

function renderTermsModal(onAccept = vi.fn().mockResolvedValue(undefined)) {
  const result = render(
    <div>
      <button type="button">outside-before</button>
      <TermsModal course={course} enrollment={enrollment} onAccept={onAccept} />
      <button type="button">outside-after</button>
    </div>,
  );
  return { ...result, onAccept };
}

describe('TermsModal — brief #10 (Radix dialog)', () => {
  it('exposes a labelled dialog described by the terms copy', async () => {
    renderTermsModal();
    const dialog = await screen.findByRole('dialog', {
      name: 'Accept the program terms to continue',
    });
    expect(dialog).toHaveAttribute('aria-describedby', 'terms-description');
    // Deliberately NOT asserting aria-modal. The hand-rolled dialog declared
    // aria-modal="true" while leaving the background fully reachable — the
    // attribute was a promise the markup did not keep. Radix omits it and
    // instead hides the background for real (see the inertness test below),
    // which is the guarantee aria-modal is only ever a hint about.
    expect(dialog).toHaveAttribute('tabindex', '-1');
  });

  it('moves initial focus into the dialog', async () => {
    renderTermsModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it('makes the background inert', async () => {
    renderTermsModal();
    await screen.findByRole('dialog');
    // Radix marks everything outside the dialog aria-hidden while it is open,
    // so the outside buttons are no longer reachable by role.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'outside-before' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'outside-after' })).toBeNull();
    });
    // The accept button, inside the dialog, is still reachable.
    expect(
      screen.getByRole('button', { name: 'I accept and want to continue' }),
    ).toBeInTheDocument();
  });

  it('locks background scroll while open', async () => {
    renderTermsModal();
    await screen.findByRole('dialog');
    await waitFor(() => {
      expect(document.body).toHaveStyle({ overflow: 'hidden' });
    });
  });

  it('traps focus: it never escapes to the background', async () => {
    renderTermsModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const accept = screen.getByRole('button', { name: 'I accept and want to continue' });
    accept.focus();
    expect(document.activeElement).toBe(accept);

    // Tabbing off the last focusable wraps back inside rather than reaching the
    // page behind the gate.
    fireEvent.keyDown(accept, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('refuses Escape: the terms gate has no dismiss path', async () => {
    renderTermsModal();
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(
      await screen.findByRole('dialog', { name: 'Accept the program terms to continue' }),
    ).toBeInTheDocument();
  });

  it('has no close control', async () => {
    renderTermsModal();
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('keeps the access-vs-designation sentence verbatim', async () => {
    renderTermsModal();
    expect(
      await screen.findByText(
        /Your learning access and designation standing are managed separately\./,
      ),
    ).toBeInTheDocument();
  });
});

describe('RouteFocus — brief #11 (route-change focus)', () => {
  function Harness() {
    const navigate = useNavigate();
    return (
      <>
        <RouteFocus />
        <button type="button" onClick={() => navigate('/second')}>
          go
        </button>
        <main id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<h1>first</h1>} />
            <Route path="/second" element={<h1>second</h1>} />
          </Routes>
        </main>
      </>
    );
  }

  it('does not steal focus on initial render', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Harness />
      </MemoryRouter>,
    );
    expect(document.getElementById('main-content')).not.toBe(document.activeElement);
  });

  it('moves focus to #main-content after a route change', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByRole('heading', { name: 'second' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('main-content'));
    });
  });
});

describe('Login mode switcher — brief #12', () => {
  const authProvider: LmsAuthProvider = {
    async getSession() {
      return null;
    },
    onAuthStateChange() {
      return () => undefined;
    },
    async signUp() {
      return { ok: true, message: 'Account created.', session: null };
    },
    async login() {
      return { ok: false, message: 'Unable to sign in.', session: null };
    },
    async logout() {},
    async requestPasswordReset() {
      return { ok: true, message: 'Sent.', session: null };
    },
    async updatePassword() {
      return { ok: true, message: 'Updated.', session: null };
    },
  };

  function renderLogin() {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthSessionProvider provider={authProvider}>
          <LoginPage />
        </AuthSessionProvider>
      </MemoryRouter>,
    );
  }

  it('no longer claims a tab pattern it does not implement', async () => {
    renderLogin();
    await screen.findByRole('heading', { level: 1, name: 'Sign in to continue' });
    // The old markup declared role="tablist"/role="tab" with no tabpanel, no
    // aria-controls and no roving tabindex.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tabpanel')).toHaveLength(0);
  });

  it('exposes the two modes as toggle buttons in a labelled group', async () => {
    renderLogin();
    const group = await screen.findByRole('group', { name: 'Authentication mode' });
    expect(group).toBeInTheDocument();

    const signIn = screen.getByRole('button', { name: 'Sign in', pressed: true });
    const createAccount = screen.getByRole('button', { name: 'Create account', pressed: false });
    expect(signIn).toBeInTheDocument();
    expect(createAccount).toBeInTheDocument();
  });

  it('moves the pressed state when the mode changes', async () => {
    renderLogin();
    fireEvent.click(await screen.findByRole('button', { name: 'Create account', pressed: false }));
    expect(screen.getByRole('button', { name: 'Sign in', pressed: false })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create account', pressed: true }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your learner account' }),
    ).toBeInTheDocument();
  });
});

describe('StatusAnnouncer — brief #3 (live region + focus move)', () => {
  function Harness() {
    const { message, announceAndFocus, targetRef } = useStatusAnnouncer<HTMLHeadingElement>();
    const [shown, setShown] = useState(false);
    return (
      <div>
        <StatusAnnouncer message={message} />
        <button
          type="button"
          onClick={() => {
            setShown(true);
            announceAndFocus('You scored 7 out of 10. Passed.');
          }}
        >
          submit
        </button>
        {shown ? (
          <h2 ref={targetRef} tabIndex={-1}>
            Attempt result
          </h2>
        ) : null}
      </div>
    );
  }

  it('renders an assertive, atomic live region before any message exists', () => {
    render(<Harness />);
    const region = document.querySelector('[data-slot="status-announcer"]');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toBeEmptyDOMElement();
  });

  it('announces the verdict and moves focus to the result', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));

    const region = document.querySelector('[data-slot="status-announcer"]');
    await waitFor(() => {
      expect(region).toHaveTextContent('You scored 7 out of 10. Passed.');
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Attempt result' }),
      );
    });
  });
});
