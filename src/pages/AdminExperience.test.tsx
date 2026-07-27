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

const workbookDownload = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/cfpCeExport', () => ({
  downloadCfpCeWorkbook: workbookDownload,
}));

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
    first_name: 'Jordan',
    middle_name: null,
    last_name: 'Rivers',
    firm: 'Synthetic Advisory LLC',
    job_title: 'Financial Advisor',
    phone: null,
    firm_url: null,
    address: null,
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
      lms_courses: { id: 'course-fpt', slug: 'fpt-sandbox', title: 'FPT Sandbox', ce_credits: 18, cfp_program_id: '312442' },
    },
  ],
  progress: [],
  attempts: [],
  surveyResponses: [],
  completions: [],
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
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText('Rivers')).toBeInTheDocument();
    expect(screen.getByText('Synthetic Advisory LLC')).toBeInTheDocument();
    expect(screen.getByText('Financial Advisor')).toBeInTheDocument();
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
  });
});

describe('Admin destructive confirm — brief #21 (alert-dialog, not window.confirm)', () => {
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

describe('Admin module bridge copy — X2 P39', () => {
  it('renders and saves the authorable chapter-transition sentence', async () => {
    const updateModule = vi.fn(() => ({ id: 'fpt-m2' }));
    renderAdmin('/admin/course/course-fpt', baseAdmin({ update_module: updateModule }));

    const title = await screen.findByLabelText('Module 2 title');
    const form = title.closest('form');
    expect(form).not.toBeNull();
    const bridge = within(form!).getByLabelText('Transition bridge copy');
    expect(bridge).toHaveValue(
      'See how distributed ledgers create verifiable ownership and settlement beyond Bitcoin.',
    );

    fireEvent.change(bridge, {
      target: { value: 'Understand why distributed settlement matters in client portfolios.' },
    });
    fireEvent.click(within(form!).getByRole('button', { name: 'Save module' }));

    await waitFor(() => expect(updateModule).toHaveBeenCalledWith(expect.objectContaining({
      id: 'fpt-m2',
      bridge_copy: 'Understand why distributed settlement matters in client portfolios.',
    })));
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
});

describe('Admin surveys — V1b routed editor and results', () => {
  it('round-trips seeded routed sections and renders branch-aware result breakdowns', async () => {
    const replaceFlow = vi.fn((payload: Record<string, unknown>) => ({
      outline: '§1 Starting questions → §6\n§6 Shared closing questions → submit',
      sections: payload.sections,
      questions: [],
    }));
    const readResults = vi.fn(() => ({
      lesson: { id: 'fpt-pre-course-survey', title: 'Pre-course survey' },
      course: { id: 'course-fpt', title: 'FPT Sandbox' },
      response_count: 2,
      enrolled_count: 4,
      completion_rate: 50,
      sections: [
        {
          id: 'survey-pre-spine',
          lesson_id: 'fpt-pre-course-survey',
          position: 1,
          title: 'Starting questions',
          default_next_section_id: null,
        },
      ],
      path_distribution: [{ path: ['survey-pre-spine'], count: 2 }],
      questions: [
        {
          question: {
            id: 'survey-pre-q1',
            lesson_id: 'fpt-pre-course-survey',
            section_id: 'survey-pre-spine',
            position: 1,
            prompt: 'How familiar are you with digital assets today?',
            kind: 'scale_1_5',
            choices: null,
            required: true,
            routes: null,
          },
          denominator: 2,
          breakdown: {
            kind: 'scale_1_5',
            counts: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
            average: 4.5,
          },
        },
      ],
    }));
    renderAdmin('/admin/course/course-fpt', baseAdmin({
      replace_survey_flow: replaceFlow,
      survey_results: readResults,
      reorder: () => ({}),
    }));

    const editButtons = await screen.findAllByRole('button', { name: 'Edit survey flow' });
    fireEvent.click(editButtons[0]);
    const saveButtons = await screen.findAllByRole('button', { name: 'Save survey flow' });
    fireEvent.click(saveButtons[0]);
    await waitFor(() => expect(replaceFlow).toHaveBeenCalled());
    expect(replaceFlow.mock.calls[0][0]).toEqual(expect.objectContaining({
      lesson_id: 'fpt-pre-course-survey',
      sections: expect.arrayContaining([
        expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({ kind: 'scale_1_5', required: true }),
          ]),
        }),
      ]),
    }));
    expect(await screen.findByLabelText('Survey flow outline')).toHaveTextContent('§1');

    const resultButtons = await screen.findAllByRole('button', { name: 'View results' });
    fireEvent.click(resultButtons[0]);
    expect(await screen.findByText('Average:')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Shown to 2 respondents')).toBeInTheDocument();
  }, 20_000);
});

describe('Admin CFP CE reporting — R1', () => {
  it('previews the reportable/missing/already split and records an export run', async () => {
    const exportRow = {
      completion_id: '30000000-0000-4000-8000-000000000001',
      course_id: 'course-fpt',
      person_email: 'reportable@example.test',
      cfp_program_id: '312442',
      date_individual_completed: '2026-07-16',
      attendee_cfp_board_id: '123456',
      attendee_last_name: 'Rivera',
      attendee_first_name: 'Casey',
      attendee_middle_name: '',
    };
    const missingRow = {
      ...exportRow,
      completion_id: '30000000-0000-4000-8000-000000000002',
      person_email: 'missing@example.test',
      attendee_cfp_board_id: '',
    };
    const preview = vi.fn(() => ({
      period_start: '2026-07-01',
      period_end: '2026-07-27',
      reportable: [exportRow],
      missing_id: [missingRow],
      already_reported: [],
      pending_program_courses: [],
      nudge_count: 1,
    }));
    const createRun = vi.fn(() => ({
      id: '40000000-0000-4000-8000-000000000001',
      created_at: '2026-07-27T18:00:00.000Z',
      actor_auth_user_id: 'auth-operator',
      course_ids: ['course-fpt'],
      period_start: '2026-07-01',
      period_end: '2026-07-27',
      row_count: 1,
      rows: [exportRow],
      filename: 'cfp-ce-2026-07-01-through-2026-07-27.xlsx',
    }));
    workbookDownload.mockClear();
    renderAdmin('/admin/ce-reporting', baseAdmin({
      list_ce_report_runs: () => [],
      preview_ce_report: preview,
      create_ce_report_run: createRun,
    }));

    fireEvent.click(await screen.findByRole('button', { name: 'Preview report' }));
    expect(await screen.findByText('reportable@example.test')).toBeInTheDocument();
    expect(screen.getByText('missing@example.test')).toBeInTheDocument();
    expect(screen.getByText(/14-day reporting nudge/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create and download/ }));
    await waitFor(() => expect(createRun).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(workbookDownload).toHaveBeenCalledWith(
      [exportRow],
      'cfp-ce-2026-07-01-through-2026-07-27.xlsx',
    ));
    expect(await screen.findByText(/recorded the frozen report run/)).toBeInTheDocument();
  });

  it('keeps the next default date range valid when the latest run ends today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    renderAdmin('/admin/ce-reporting', baseAdmin({
      list_ce_report_runs: () => [{
        id: '40000000-0000-4000-8000-000000000002',
        created_at: `${today}T18:00:00.000Z`,
        actor_auth_user_id: 'auth-operator',
        course_ids: [
          'course-fpt',
          'course-bonus-custody',
          'course-bonus-ethereum-etfs',
          'course-bonus-nfts',
          'course-bonus-defi-daos',
          'course-bonus-staking',
          'course-bonus-genius-act',
        ],
        period_start: today,
        period_end: today,
        row_count: 1,
        rows: [],
        filename: `cfp-ce-${today}-through-${today}.xlsx`,
      }],
    }));
    expect(await screen.findByLabelText('Period start')).toHaveValue(today);
    expect(screen.getByLabelText('Period end')).toHaveValue(today);
  });
});
