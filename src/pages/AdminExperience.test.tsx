import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthSessionProvider } from '../context/AuthContext';
import { LmsProvider } from '../context/LmsContext';
import { mockProvider } from '../data/mockProvider';
import type { LearnerInspection } from '../data/admin';
import {
  LmsDataError,
  type LmsAdminProvider,
  type LmsAuthProvider,
  type LmsAuthSession,
} from '../data/provider';

const operatorSession: LmsAuthSession = {
  user: { id: 'auth-operator', email: 'operator@example.test', displayName: 'Operator', role: 'operator' },
};

function operatorAuth(): LmsAuthProvider {
  return {
    async getSession() { return operatorSession; },
    onAuthStateChange() { return () => undefined; },
    async signUp() { return { ok: true, message: '', session: operatorSession }; },
    async login() { return { ok: true, message: '', session: operatorSession }; },
    async logout() {},
    async requestPasswordReset() { return { ok: true, message: '', session: null }; },
    async updatePassword() { return { ok: true, message: '', session: operatorSession }; },
  };
}

function renderAdmin(route: string, admin: LmsAdminProvider) {
  window.history.replaceState({}, '', route);
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthSessionProvider provider={operatorAuth()}>
        <LmsProvider provider={mockProvider}>
          <App adminProvider={admin} />
        </LmsProvider>
      </AuthSessionProvider>
    </MemoryRouter>,
  );
}

const inspection: LearnerInspection = {
  user: { id: 'learner-1', email: 'jordan@example.test' },
  profile: {
    auth_user_id: 'learner-1',
    display_name: 'Jordan Rivers',
    credential_ids: { cfp: 'CFP-42', iwi: undefined, cfa: undefined },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  enrollments: [
    {
      id: 'enr-1',
      person_email: 'jordan@example.test',
      auth_user_id: 'learner-1',
      course_id: 'course-fpt',
      source: 'synthetic',
      enrolled_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2027-07-16T00:00:00.000Z',
      status: 'active',
      terms_accepted_at: '2026-01-02T00:00:00.000Z',
      order_id: null,
      lms_courses: { id: 'course-fpt', slug: 'fpt-sandbox', title: 'FPT Sandbox', ce_credits: 18 },
    },
  ],
  progress: [{
    id: 'progress-1',
    enrollment_id: 'enr-1',
    lesson_id: 'fpt-m1-video',
    started_at: '2026-01-03T00:00:00.000Z',
    completed_at: '2026-01-03T00:04:00.000Z',
    last_position_seconds: 4,
    max_watched_seconds: 4,
    max_watched_updated_at: '2026-01-03T00:04:00.000Z',
    updated_at: '2026-01-03T00:04:00.000Z',
  }],
  attempts: [],
  completions: [{
    id: 'completion-1',
    enrollment_id: 'enr-1',
    completed_at: '2026-02-01T00:00:00.000Z',
    trigger: 'all_requirements_met',
    processed_at: null,
    designation_issued: false,
  }],
  summaries: [{ enrollment_id: 'enr-1', percent_complete: 40 }],
};

function baseAdmin(overrides: Partial<Record<string, unknown>> = {}): LmsAdminProvider {
  return {
    async adminRequest<T>(action: string, payload: Record<string, unknown> = {}) {
      if (action === 'list_catalog') return (await mockProvider.getCatalog()) as T;
      if (action === 'list_audit') return [] as T;
      if (action === 'inspect_learner') return inspection as T;
      const handler = overrides[action] as ((p: Record<string, unknown>) => unknown) | undefined;
      if (handler) return handler(payload) as T;
      return {} as T;
    },
  };
}

describe('Admin inspector — brief #21 (no JSON dumps)', () => {
  it('renders credential IDs as labelled fields, not a JSON block', async () => {
    renderAdmin('/admin/learners', baseAdmin());
    fireEvent.change(await screen.findByLabelText('Learner email'), { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));

    // The credential IDs are now labelled description-list terms.
    const cfp = await screen.findByText('CFP ID');
    expect(cfp.tagName).toBe('DT');
    expect(screen.getByText('CFP-42')).toBeInTheDocument();
    // Empty credentials read as an em dash, never "null"/"undefined".
    expect(screen.queryByText(/null|undefined/)).toBeNull();
    // No raw JSON dump survives.
    expect(document.querySelector('pre')).toBeNull();
    expect(document.body.textContent).not.toContain('{');
  });

  it('shows enrollment evidence as structured facts', async () => {
    renderAdmin('/admin/learners', baseAdmin());
    fireEvent.change(await screen.findByLabelText('Learner email'), { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));

    expect(await screen.findByRole('heading', { name: 'FPT Sandbox' })).toBeInTheDocument();
    expect(screen.getByText('Access expiry')).toBeInTheDocument();
    expect(screen.getByText('Terms accepted')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lesson progress' })).toBeInTheDocument();
    expect(screen.getByText('Bitcoin Foundations: Video lesson')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Completion events' })).toBeInTheDocument();
    expect(screen.getByText('all_requirements_met')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Module 1 quiz attempts' })).toBeInTheDocument();
  });
});

describe('Admin destructive confirm — brief #21 (alert-dialog, not window.confirm)', () => {
  it('exposes and confirms course deletion through the audited admin boundary', async () => {
    const deleteCourse = vi.fn(() => ({ id: 'course-fpt' }));
    renderAdmin('/admin/course/course-fpt', baseAdmin({ delete_course: deleteCourse }));

    fireEvent.click(await screen.findByRole('button', { name: 'Delete course' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/all nested content and learner history/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete course' }));

    await waitFor(() => expect(deleteCourse).toHaveBeenCalledWith({ id: 'course-fpt' }));
  });

  it('confirms a module delete through the alert-dialog', async () => {
    const deleteModule = vi.fn(() => ({ id: 'fpt-m1' }));
    renderAdmin('/admin/course/course-fpt', baseAdmin({ delete_module: deleteModule, reorder: () => ({}) }));

    fireEvent.click((await screen.findAllByRole('button', { name: /Delete Bitcoin Foundations/ }))[0]);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/every lesson, resource, and question bank/i)).toBeInTheDocument();
    // brief #21: Cancel owns the initial focus, so a stray Enter dismisses
    // rather than deletes.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );
    // Nothing deleted yet — the dialog is a gate.
    expect(deleteModule).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete module' }));
    await waitFor(() => expect(deleteModule).toHaveBeenCalledTimes(1));
  });

  it('cancels without mutating', async () => {
    const deleteModule = vi.fn(() => ({ id: 'fpt-m1' }));
    renderAdmin('/admin/course/course-fpt', baseAdmin({ delete_module: deleteModule, reorder: () => ({}) }));

    fireEvent.click((await screen.findAllByRole('button', { name: /Delete Bitcoin Foundations/ }))[0]);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteModule).not.toHaveBeenCalled();
  });
});

describe('Admin session expiry — brief #21 L-11 (re-auth, UI only)', () => {
  it('surfaces a re-auth prompt instead of a dead retry when the session is denied', async () => {
    const deniedAdmin: LmsAdminProvider = {
      async adminRequest<T>(action: string) {
        if (action === 'list_catalog') throw new LmsDataError('denied', 'Session expired.');
        if (action === 'list_audit') return [] as T;
        return {} as T;
      },
    };
    renderAdmin('/admin', deniedAdmin);

    expect(
      await screen.findByRole('heading', { name: 'Your operator session has expired' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in again/ })).toBeInTheDocument();
    // Not the generic dead-end.
    expect(screen.queryByText('Admin data unavailable')).toBeNull();
  });

  it('keeps the ordinary unavailable path for a non-denied failure', async () => {
    const brokenAdmin: LmsAdminProvider = {
      async adminRequest<T>(action: string) {
        if (action === 'list_catalog') throw new Error('network');
        if (action === 'list_audit') return [] as T;
        return {} as T;
      },
    };
    renderAdmin('/admin', brokenAdmin);

    expect(await screen.findByText('Admin data unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your operator session has expired' })).toBeNull();
  });

  it('surfaces the same re-auth prompt when a denied learner-inspection read expires', async () => {
    const deniedReadAdmin: LmsAdminProvider = {
      async adminRequest<T>(action: string) {
        if (action === 'list_catalog') return (await mockProvider.getCatalog()) as T;
        if (action === 'list_audit') return [] as T;
        if (action === 'inspect_learner') throw new LmsDataError('denied', 'Session expired.');
        return {} as T;
      },
    };
    renderAdmin('/admin/learners', deniedReadAdmin);

    fireEvent.change(await screen.findByLabelText('Learner email'), {
      target: { value: 'jordan@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));

    expect(
      await screen.findByRole('heading', { name: 'Your operator session has expired' }),
    ).toBeInTheDocument();
  });
});

describe('Admin nested route fallback', () => {
  it('redirects an unknown admin path to the course catalog instead of rendering blank', async () => {
    renderAdmin('/admin/not-a-route', baseAdmin());
    expect(await screen.findByRole('heading', { name: 'Course catalog' })).toBeInTheDocument();
  });
});
