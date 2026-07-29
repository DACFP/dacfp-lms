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
  progress: [
    {
      id: 'progress-completed',
      enrollment_id: 'enr-1',
      lesson_id: 'fpt-m1-video',
      started_at: '2026-07-18T10:00:00.000Z',
      completed_at: '2026-07-18T10:10:00.000Z',
      last_position_seconds: 600,
      max_watched_seconds: 600,
      max_watched_updated_at: '2026-07-18T10:10:00.000Z',
      updated_at: '2026-07-18T10:10:00.000Z',
    },
    {
      id: 'progress-resume',
      enrollment_id: 'enr-1',
      lesson_id: 'fpt-m2-video',
      started_at: '2026-07-20T12:00:00.000Z',
      completed_at: null,
      last_position_seconds: 91,
      max_watched_seconds: 91,
      max_watched_updated_at: '2026-07-20T12:01:31.000Z',
      updated_at: '2026-07-20T12:01:31.000Z',
    },
  ],
  attempts: [],
  surveyResponses: [],
  completions: [],
  summaries: [{ enrollment_id: 'enr-1', percent_complete: 40 }],
};

function baseAdmin(overrides: Partial<Record<string, unknown>> = {}): LmsAdminProvider {
  return {
    async adminRequest<T>(action: string, payload: Record<string, unknown> = {}) {
      const handler = overrides[action] as ((p: Record<string, unknown>) => unknown) | undefined;
      if (handler) return handler(payload) as T;
      if (action === 'list_catalog') return (await mockProvider.getCatalog()) as T;
      if (action === 'list_audit') return [] as T;
      if (action === 'inspect_learner') return inspection as T;
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
    fireEvent.click(screen.getByText('Lesson progress (2)'));
    expect(screen.getByText('Bitcoin Foundations: Video lesson')).toBeInTheDocument();
    expect(screen.getByText('Completed Jul 18, 2026')).toBeInTheDocument();
    expect(screen.getByText('Blockchain and DLT: Video lesson')).toBeInTheDocument();
    expect(screen.getByText('Resume at 1:31')).toBeInTheDocument();
    expect(screen.getAllByText(/Updated/)).toHaveLength(2);
  });

  it('names manual completion for both the course and learner', async () => {
    renderAdmin('/admin/learners', baseAdmin());
    fireEvent.change(await screen.findByLabelText('Learner email'), { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));

    expect(await screen.findByRole('button', {
      name: 'Manual mark complete FPT Sandbox for Jordan Rivers',
    })).toBeInTheDocument();
  });

  it('names every quiz reset for its module and learner', async () => {
    renderAdmin('/admin/learners', baseAdmin());
    fireEvent.change(await screen.findByLabelText('Learner email'), { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));

    const reset = await screen.findByRole('button', {
      name: 'Reset Module 3 “Digital Assets and Currencies” quiz attempts in FPT Sandbox for Jordan Rivers',
    });
    fireEvent.click(reset);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', {
      name: 'Reset Module 3 “Digital Assets and Currencies” quiz attempts in FPT Sandbox for Jordan Rivers?',
    })).toBeInTheDocument();
    expect(within(dialog).getByText(/^Every recorded attempt for “Digital Assets and Currencies”/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', {
      name: 'Reset Module 3 “Digital Assets and Currencies” quiz attempts in FPT Sandbox for Jordan Rivers',
    })).toBeInTheDocument();
  });

  it('keeps same-position quiz reset names unique across enrolled courses', async () => {
    const renewalEnrollment: LearnerInspection['enrollments'][number] = {
      id: 'enr-renewal',
      person_email: 'jordan@example.test',
      auth_user_id: 'learner-1',
      course_id: 'course-renewal-2026',
      source: 'synthetic',
      enrolled_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2027-07-16T00:00:00.000Z',
      status: 'active',
      terms_accepted_at: null,
      order_id: null,
      lms_courses: {
        id: 'course-renewal-2026',
        slug: 'renewal-2026-sandbox',
        title: 'Renewal 2026 Sandbox',
        ce_credits: 1,
        cfp_program_id: null,
      },
    };
    const twoCourseInspection: LearnerInspection = {
      ...inspection,
      enrollments: [...inspection.enrollments, renewalEnrollment],
      summaries: [
        ...inspection.summaries,
        { enrollment_id: renewalEnrollment.id, percent_complete: 0 },
      ],
    };
    renderAdmin('/admin/learners', baseAdmin({ inspect_learner: () => twoCourseInspection }));
    fireEvent.change(await screen.findByLabelText('Learner email'), { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));

    expect(await screen.findByRole('button', {
      name: 'Reset Module 1 “Bitcoin Foundations” quiz attempts in FPT Sandbox for Jordan Rivers',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: 'Reset Module 1 “2026 Annual Update” quiz attempts in Renewal 2026 Sandbox for Jordan Rivers',
    })).toBeInTheDocument();
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

  it('names a course delete and surfaces enrollment refusal with support copy', async () => {
    const deleteCourse = vi.fn(() => {
      throw new Error('Course has enrollments and cannot be deleted.');
    });
    renderAdmin('/admin/course/course-fpt', baseAdmin({ delete_course: deleteCourse }));

    fireEvent.click(await screen.findByRole('button', { name: 'Delete course' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Delete “FPT Sandbox”?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/modules, lessons, quizzes, surveys/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete FPT Sandbox' }));

    expect(await screen.findByText(/Deletion refused.*FPT Sandbox.*has enrollments.*Contact support/)).toBeInTheDocument();
    expect(deleteCourse).toHaveBeenCalledTimes(1);
  });
});

describe('Admin pending and empty states — F6', () => {
  it('shows an empty curriculum state and guards repeated Add module submits', async () => {
    let resolveCreate: ((value: unknown) => void) | undefined;
    const createModule = vi.fn(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const catalog = await mockProvider.getCatalog();
    renderAdmin('/admin/course/course-fpt', baseAdmin({
      list_catalog: () => ({
        ...catalog,
        modules: catalog.modules.filter((module) => module.course_id !== 'course-fpt'),
        lessons: catalog.lessons.filter((lesson) => !lesson.module_id.startsWith('fpt-')),
        quizzes: catalog.quizzes.filter((quiz) => !quiz.module_id.startsWith('fpt-')),
      }),
      create_module: createModule,
    }));

    expect(await screen.findByRole('heading', { name: 'No curriculum yet' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New module title'), { target: { value: 'First module' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    const pending = await screen.findByRole('button', { name: 'Adding module…' });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(createModule).toHaveBeenCalledTimes(1);
    resolveCreate?.({ id: 'new-module' });
  });

  it('guards repeated Add lesson, Save lesson, and Save survey submits', async () => {
    const never = () => new Promise(() => undefined);
    const createLesson = vi.fn(never);
    const updateLesson = vi.fn(never);
    const saveSurvey = vi.fn(never);
    renderAdmin('/admin/course/course-fpt', baseAdmin({
      create_lesson: createLesson,
      update_lesson: updateLesson,
      replace_survey_flow: saveSurvey,
    }));

    const lessonTitle = (await screen.findAllByLabelText('New lesson title'))[0];
    fireEvent.change(lessonTitle, { target: { value: 'Synthetic lesson' } });
    fireEvent.click(within(lessonTitle.closest('form')!).getByRole('button', { name: 'Add lesson' }));
    expect(await within(lessonTitle.closest('form')!).findByRole('button', { name: 'Adding lesson…' })).toBeDisabled();
    expect(createLesson).toHaveBeenCalledTimes(1);

    const lessonInput = screen.getByDisplayValue('Welcome to the Financial Professional Track');
    const lessonForm = lessonInput.closest('form')!;
    fireEvent.submit(lessonForm);
    expect(await within(lessonForm).findByRole('button', { name: 'Saving lesson…' })).toBeDisabled();
    fireEvent.submit(lessonForm);
    expect(updateLesson).toHaveBeenCalledTimes(1);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit survey flow' }))[0]);
    const surveySave = (await screen.findAllByRole('button', { name: 'Save survey flow' }))[0];
    fireEvent.click(surveySave);
    expect(await screen.findByRole('button', { name: 'Saving survey flow…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Saving survey flow…' }));
    expect(saveSurvey).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('clears stale learner results while a guarded lookup is pending', async () => {
    let resolveSecond: ((value: LearnerInspection | null) => void) | undefined;
    const inspect = vi.fn((payload: Record<string, unknown>) => payload.email === 'second@example.test'
      ? new Promise<LearnerInspection | null>((resolve) => { resolveSecond = resolve; })
      : inspection);
    renderAdmin('/admin/learners', baseAdmin({ inspect_learner: inspect }));

    const input = await screen.findByLabelText('Learner email');
    fireEvent.change(input, { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));
    expect(await screen.findByRole('heading', { name: 'Jordan Rivers' })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'second@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect learner' }));
    expect(await screen.findByRole('button', { name: 'Inspecting learner…' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Jordan Rivers' })).toBeNull();
    expect(inspect).toHaveBeenCalledTimes(2);
    resolveSecond?.(null);
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

  it('disables move-up on the first ordered row, including position zero', async () => {
    renderAdmin('/admin/course/course-fpt', baseAdmin({ reorder: () => ({}) }));
    expect(await screen.findByRole('button', { name: 'Move Introduction up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bitcoin Foundations up' })).toBeEnabled();
  });

  it('hides video-only fields from reading and survey editors', async () => {
    renderAdmin('/admin/course/course-fpt', baseAdmin());

    const readingTitle = await screen.findByDisplayValue('Bitcoin Foundations: Reading');
    const readingForm = readingTitle.closest('form')!;
    expect(within(readingForm).queryByLabelText('video_ref path')).toBeNull();
    expect(within(readingForm).queryByLabelText('Duration seconds')).toBeNull();
    expect(within(readingForm).getByLabelText('Reading body')).toBeInTheDocument();

    const surveyTitle = screen.getByDisplayValue('Pre-course survey');
    const surveyForm = surveyTitle.closest('form')!;
    expect(within(surveyForm).queryByLabelText('video_ref path')).toBeNull();
    expect(within(surveyForm).queryByLabelText('Duration seconds')).toBeNull();
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

  it('surfaces the affected response count before confirming an orphaning edit', async () => {
    const replaceFlow = vi.fn(async (payload: Record<string, unknown>) => {
      if (payload.confirm_orphan !== true) {
        throw new Error(
          'SURVEY_ORPHAN_CONFIRMATION_REQUIRED: 2 affected response(s)',
        );
      }
      return {
        outline: '§1 Synthetic retained section → submit',
        sections: payload.sections,
        questions: [],
      };
    });
    renderAdmin('/admin/course/course-fpt', baseAdmin({
      replace_survey_flow: replaceFlow,
      reorder: () => ({}),
    }));

    const editButtons = await screen.findAllByRole('button', { name: 'Edit survey flow' });
    fireEvent.click(editButtons[0]);
    const saveButtons = await screen.findAllByRole('button', { name: 'Save survey flow' });
    fireEvent.click(saveButtons[0]);

    const review = await screen.findByRole('button', {
      name: 'Review destructive survey edit',
    });
    fireEvent.click(review);
    expect(await screen.findByText(/2 existing responses reference a section being deleted/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: 'Delete and orphan 2 responses',
    }));
    await waitFor(() => expect(replaceFlow).toHaveBeenCalledTimes(2));
    expect(replaceFlow.mock.calls[1][0]).toEqual(expect.objectContaining({
      confirm_orphan: true,
    }));
    expect(await screen.findByLabelText('Survey flow outline')).toHaveTextContent('Synthetic retained');
  }, 20_000);
});

describe('Admin CFP CE reporting — R1', () => {
  it('previews the reportable/missing/already split and records an export run', async () => {
    const exportRow = {
      completion_id: '30000000-0000-4000-8000-000000000001',
      course_id: 'course-fpt',
      person_email: 'reportable@example.test',
      trigger: 'all_requirements_met' as const,
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
    const manualRow = {
      ...exportRow,
      completion_id: '30000000-0000-4000-8000-000000000004',
      person_email: 'manual@example.test',
      trigger: 'manual_admin' as const,
    };
    const excludedRow = {
      ...exportRow,
      completion_id: '30000000-0000-4000-8000-000000000003',
      person_email: 'excluded@example.test',
      attendee_first_name: '',
      reason: 'blank-name' as const,
    };
    const preview = vi.fn(() => ({
      period_start: '2026-07-01',
      period_end: '2026-07-27',
      reportable: [exportRow],
      manual: [manualRow],
      missing_id: [missingRow],
      already_reported: [],
      excluded: [excludedRow],
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
    expect(screen.getByText('manual@example.test')).toBeInTheDocument();
    expect(screen.getByText('Manual admin')).toBeInTheDocument();
    expect(screen.getByText('missing@example.test')).toBeInTheDocument();
    expect(screen.getByText('excluded@example.test')).toBeInTheDocument();
    expect(screen.getByText('blank-name')).toBeInTheDocument();
    expect(screen.getByText(/14-day reporting nudge/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create and download/ }));
    await waitFor(() => expect(createRun).toHaveBeenCalledTimes(1));
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      completion_ids: [exportRow.completion_id],
      include_manual: false,
    }));
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
    await waitFor(() => expect(screen.getByLabelText('Period start')).toHaveValue(today));
    expect(screen.getByLabelText('Period end')).toHaveValue(today);
  });

  it('downloads a retained run again from its frozen rows and filename', async () => {
    const frozenRow = {
      completion_id: '30000000-0000-4000-8000-000000000009',
      course_id: 'course-fpt',
      person_email: 'retained@example.test',
      trigger: 'all_requirements_met' as const,
      cfp_program_id: '312442',
      date_individual_completed: '2026-07-16',
      attendee_cfp_board_id: '654321',
      attendee_last_name: 'Retained',
      attendee_first_name: 'Row',
      attendee_middle_name: '',
    };
    const filename = 'cfp-ce-retained-sandbox.xlsx';
    workbookDownload.mockClear();
    renderAdmin('/admin/ce-reporting', baseAdmin({
      list_ce_report_runs: () => [{
        id: '40000000-0000-4000-8000-000000000009',
        created_at: '2026-07-27T18:00:00.000Z',
        actor_auth_user_id: 'auth-operator',
        course_ids: ['course-fpt'],
        period_start: '2026-07-01',
        period_end: '2026-07-27',
        row_count: 1,
        rows: [frozenRow],
        filename,
      }],
    }));

    fireEvent.click(await screen.findByRole('button', { name: 'Download again' }));
    await waitFor(() => expect(workbookDownload).toHaveBeenCalledWith([frozenRow], filename));
  });
});
