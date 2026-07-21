import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthSessionProvider } from './context/AuthContext';
import { LmsProvider } from './context/LmsContext';
import { mockProvider } from './data/mockProvider';
import type {
  LmsAuthProvider,
  LmsAuthSession,
  LmsProvider as LmsDataProvider,
  LmsAdminProvider,
} from './data/provider';
import { LmsDataError } from './data/provider';
import type { LearnerStateKey } from './data/types';

const signedInSession: LmsAuthSession = {
  user: {
    id: 'auth-fully-complete',
    email: 'complete@example.test',
    displayName: 'Fully complete',
    role: 'learner',
  },
};

const operatorSession: LmsAuthSession = {
  user: {
    id: 'auth-operator',
    email: 'operator@example.test',
    displayName: 'Synthetic operator',
    role: 'operator',
  },
};

const mockAdminProvider: LmsAdminProvider = {
  async adminRequest<T>(action: string) {
    if (action === 'list_catalog') return (await mockProvider.getCatalog()) as T;
    if (action === 'list_audit') return [] as T;
    throw new Error(`Unexpected admin action: ${action}`);
  },
};

function testAuthProvider(session: LmsAuthSession | null): LmsAuthProvider {
  return {
    async getSession() {
      return session;
    },
    onAuthStateChange() {
      return () => undefined;
    },
    async signUp() {
      return { ok: true, message: 'Account created.', session };
    },
    async login() {
      return session
        ? { ok: true, message: 'Signed in.', session }
        : { ok: false, message: 'Unable to sign in.', session: null };
    },
    async logout() {},
    async requestPasswordReset() {
      return { ok: true, message: 'If an account exists, reset instructions will be sent.', session: null };
    },
    async updatePassword() {
      return { ok: true, message: 'Password updated.', session };
    },
  };
}

/**
 * M-10 removed ?learner= from the learner app, so a test can no longer pick a
 * synthetic state through the URL. It binds the state to the provider instead,
 * which is where it always belonged: only mockProvider honours the learner key
 * at all — every supabaseProvider method ignores it and scopes to auth.uid().
 *
 * Wrapping (rather than replacing) keeps each test's own overrides intact: an
 * override still receives the bound learner as its argument.
 */
function scopedProvider(
  base: LmsDataProvider,
  learner: LearnerStateKey,
): LmsDataProvider {
  return {
    ...base,
    getLearnerSnapshot: () => base.getLearnerSnapshot(learner),
    getPlaybackToken: (lessonId) => base.getPlaybackToken(lessonId, learner),
    getResourceToken: (resourceId) => base.getResourceToken(resourceId, learner),
    recordHeartbeat: (lessonId, positionSeconds) =>
      base.recordHeartbeat(lessonId, positionSeconds, learner),
    completeReading: (lessonId) => base.completeReading(lessonId, learner),
    getQuiz: (quizId) => base.getQuiz(quizId, learner),
    gradeQuiz: (quizId, answers) => base.gradeQuiz(quizId, answers, learner),
  };
}

function renderRoute(
  path: string,
  learner: LearnerStateKey = 'fully-complete',
  authProvider = testAuthProvider(signedInSession),
  dataProvider: LmsDataProvider = mockProvider,
) {
  window.history.replaceState({}, '', path);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthSessionProvider provider={authProvider}>
        <LmsProvider provider={scopedProvider(dataProvider, learner)}>
          <App />
        </LmsProvider>
      </AuthSessionProvider>
    </MemoryRouter>,
  );
}

/**
 * The O2 quiz is a stepper (brief #1-#4): one question per screen, then a
 * review screen that owns the only Submit control. Reaching Submit therefore
 * means walking the steps. This helper does exactly what a learner does.
 */
async function walkToReview() {
  // Advance until the review screen's Submit appears.
  for (let guard = 0; guard < 25; guard += 1) {
    const submit = screen.queryByRole('button', { name: 'Submit attempt' });
    if (submit) return submit;
    const next =
      screen.queryByRole('button', { name: 'Review answers' }) ??
      screen.queryByRole('button', { name: 'Next' });
    if (!next) break;
    fireEvent.click(next);
  }
  return await screen.findByRole('button', { name: 'Submit attempt' });
}

describe('D0 route shell', () => {
  it.each<[string, string | RegExp]>([
    ['/login', 'Sign in to continue'],
    ['/reset', 'Reset your password'],
    // T1: the dashboard greets by first name in the mockup's register, and the
    // greeting tracks time of day — hence the regex.
    ['/dashboard', /^Good (morning|afternoon|evening), Fully\.$/],
    ['/course/fpt-sandbox/module/1', 'Bitcoin Foundations'],
    ['/lesson/fpt-m1-video', 'Bitcoin Foundations: Video lesson'],
    // T1 vocabulary: the quiz surface is the module checkpoint.
    ['/quiz/fpt-m1', 'Module 1 checkpoint'],
    ['/account', 'Profile and credentials'],
  ])('renders %s on mock data', async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('shows session loading without issuing LMS data requests', async () => {
    const getCatalog = vi.fn(mockProvider.getCatalog);
    const loadingAuthProvider: LmsAuthProvider = {
      ...testAuthProvider(null),
      getSession: () => new Promise(() => undefined),
    };
    renderRoute(
      '/',
      'fresh',
      loadingAuthProvider,
      { ...mockProvider, getCatalog },
    );
    expect(await screen.findByText('Checking your secure session…')).toBeInTheDocument();
    expect(getCatalog).not.toHaveBeenCalled();
  });

  it('shows the blocking terms modal to the fresh learner', async () => {
    renderRoute('/dashboard', 'fresh');
    expect(await screen.findByRole('dialog', { name: 'Accept the program terms to continue' })).toBeInTheDocument();
  });

  it('refreshes catalog access after the learner accepts terms', async () => {
    let accepted = false;
    const getCatalog = vi.fn(mockProvider.getCatalog);
    const termsProvider: LmsDataProvider = {
      ...mockProvider,
      getCatalog,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) => ({
            ...enrollment,
            terms_accepted_at:
              accepted && enrollment.course_id === 'course-fpt'
                ? new Date().toISOString()
                : enrollment.terms_accepted_at,
          })),
        };
      },
      async acceptTerms(enrollmentId) {
        accepted = true;
        const snapshot = await this.getLearnerSnapshot('fresh');
        return snapshot.enrollments.find((item) => item.id === enrollmentId)!;
      },
    };

    renderRoute('/dashboard', 'fresh', testAuthProvider(signedInSession), termsProvider);
    fireEvent.click(
      await screen.findByRole('button', { name: 'I accept and want to continue' }),
    );
    // T1/R1: sequential modules render truthful passed/current/locked states,
    // so the post-accept signal is Module 1 becoming "Up next", not the
    // mockup's blanket "Available".
    expect(await screen.findByText('Up next')).toBeInTheDocument();
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it.each<[string, LearnerStateKey, string]>([
    ['/course/fpt-sandbox/module/4', 'quiz-failed-on-3', 'Content is not available yet'],
    ['/lesson/fpt-m4-video', 'quiz-failed-on-3', 'This lesson is locked'],
    ['/quiz/fpt-m4', 'quiz-failed-on-3', 'Checkpoint unavailable'],
  ])('renders a recoverable locked state on %s', async (path, learner, message) => {
    renderRoute(path, learner);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', {
        name: /Back to dashboard|Back to module|Return to module/,
      }).length,
    ).toBeGreaterThan(0);
  });

  it('renders lesson resources and all optional account credential fields', async () => {
    renderRoute('/lesson/fpt-m1-reading');
    expect(await screen.findByRole('heading', { name: 'Lesson resources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bitcoin foundations workbook/ })).toBeInTheDocument();
  });

  it('shows the locked bonus promise until the FPT completion event exists', async () => {
    renderRoute('/dashboard', 'fresh');
    expect(
      await screen.findByText(/Complete FPT to unlock this bonus course/i),
    ).toBeInTheDocument();
  });

  it('shows the renewal enrollment and flips the bonus card after FPT completion', async () => {
    renderRoute('/dashboard', 'fpt-completed');
    expect(await screen.findByRole('heading', { name: 'Bonus Sandbox' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Renewal 2026 Sandbox' })).toBeInTheDocument();
    expect(screen.queryByText(/Complete FPT to unlock this bonus course/i)).not.toBeInTheDocument();
  });

  it('does not mistake RLS-hidden gated modules for a completed course', async () => {
    const gatedCatalogProvider: LmsDataProvider = {
      ...mockProvider,
      async getCatalog() {
        const catalog = await mockProvider.getCatalog();
        return { ...catalog, modules: [], lessons: [], resources: [], quizzes: [] };
      },
    };

    renderRoute('/dashboard', 'fresh', testAuthProvider(signedInSession), gatedCatalogProvider);
    expect(await screen.findByText('Terms required')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.queryByText(/^Complete$/)).not.toBeInTheDocument();
  });

  it('renders an empty enrollment state with a recovery path', async () => {
    const emptyProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: [],
          progress: [],
          attempts: [],
          completions: [],
        };
      },
    };
    renderRoute('/dashboard', 'fresh', testAuthProvider(signedInSession), emptyProvider);
    expect(await screen.findByRole('heading', { name: 'No courses yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Review account' }).length).toBeGreaterThan(0);
  });

  it('renders expired access without an open-course action', async () => {
    const expiredProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) => ({
            ...enrollment,
            status: 'expired' as const,
            expires_at: '2026-01-01T00:00:00.000Z',
          })),
        };
      },
    };
    renderRoute('/dashboard', 'fully-complete', testAuthProvider(signedInSession), expiredProvider);
    expect((await screen.findAllByText('Access expired')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/does not itself change designation standing/i).length).toBeGreaterThan(0);
  });

  it('keeps an expired enrollment visible when RLS hides its course metadata', async () => {
    const hiddenExpiredProvider: LmsDataProvider = {
      ...mockProvider,
      async getCatalog() {
        return { courses: [], modules: [], lessons: [], resources: [], quizzes: [] };
      },
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) => ({
            ...enrollment,
            status: 'expired' as const,
            expires_at: '2026-01-01T00:00:00.000Z',
          })),
        };
      },
    };

    renderRoute('/dashboard', 'fresh', testAuthProvider(signedInSession), hiddenExpiredProvider);
    expect((await screen.findAllByRole('heading', { name: 'Expired course access' })).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/This does not itself change designation standing/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Review account' }).length).toBeGreaterThan(0);
  });

  it.each([
    [new LmsDataError('denied', 'denied'), 'Learning access is unavailable', 'No learner access'],
    [new Error('offline'), 'We could not load the learning portal', 'Connection issue'],
  ])('renders a recoverable data error state', async (failure, heading, eyebrow) => {
    const failingProvider: LmsDataProvider = {
      ...mockProvider,
      async getCatalog() {
        throw failure;
      },
    };
    renderRoute('/dashboard', 'fresh', testAuthProvider(signedInSession), failingProvider);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByText(eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('renders the three credential ID fields on the account route', async () => {
    renderRoute('/account');
    expect(await screen.findByLabelText('CFP ID')).toBeInTheDocument();
    expect(screen.getByLabelText('IWI ID')).toBeInTheDocument();
    expect(screen.getByLabelText('CFA ID')).toBeInTheDocument();
  });

  it('marks an accessible reading complete through the provider action', async () => {
    renderRoute('/lesson/fpt-m2-reading', 'mid-module-2');
    const button = await screen.findByRole('button', {
      name: 'Mark reading complete',
    });
    fireEvent.click(button);
    expect(
      await screen.findByRole('button', { name: 'Reading complete' }),
    ).toBeDisabled();
  });

  it('renders the server grading result and unlimited retake control', async () => {
    const getCatalog = vi.fn(mockProvider.getCatalog);
    const quizProvider: LmsDataProvider = {
      ...mockProvider,
      getCatalog,
      async gradeQuiz() {
        return {
          attempt_number: 1,
          score: 7,
          possible_points: 10,
          passed: true,
          completion_fired: true,
        };
      },
    };
    renderRoute(
      '/quiz/fpt-m4',
      'one-quiz-from-done',
      testAuthProvider(signedInSession),
      quizProvider,
    );
    // Wait for the first question before stepping (the payload loads async).
    await screen.findByText('Select one answer');
    fireEvent.click(await walkToReview());
    expect(await screen.findByText('7/10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake checkpoint' })).toBeInTheDocument();
    expect(screen.getByText('All course requirements are complete.')).toBeInTheDocument();
    expect(screen.getByText(/Bonus Sandbox unlocked on your dashboard/i)).toBeInTheDocument();
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it('announces the next sequential module when a quiz passes', async () => {
    const quizProvider: LmsDataProvider = {
      ...mockProvider,
      async gradeQuiz() {
        return {
          attempt_number: 2,
          score: 7,
          possible_points: 10,
          passed: true,
          completion_fired: false,
        };
      },
    };
    renderRoute(
      '/quiz/fpt-m3',
      'quiz-failed-on-3',
      testAuthProvider(signedInSession),
      quizProvider,
    );
    await screen.findByText('Select one answer');
    fireEvent.click(await walkToReview());
    expect(await screen.findByText('Module 4 unlocked. You can continue immediately.')).toBeInTheDocument();
  });

  it('renders normal single-answer quiz questions as radio groups', async () => {
    renderRoute('/quiz/fpt-m1', 'fully-complete');
    // The stepper shows one question per screen (brief #1), so the counts are
    // per-step now rather than 10 prompts / 40 radios in one scroll. The
    // property under test is unchanged: single-select renders radios, never
    // checkboxes. Walking every step proves it holds for all ten, which the
    // old single assertion could not.
    expect(await screen.findByText('Select one answer')).toBeInTheDocument();
    for (let step = 1; step <= 10; step += 1) {
      expect(screen.getByText(`Question ${step} of 10`)).toBeInTheDocument();
      expect(screen.getAllByRole('radio')).toHaveLength(4);
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      if (step < 10) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
  });

  it('uses checkboxes only when select_kind is multi', async () => {
    const mixedProvider: LmsDataProvider = {
      ...mockProvider,
      async getQuiz(quizId, learner) {
        const payload = await mockProvider.getQuiz(quizId, learner);
        return {
          ...payload,
          questions: payload.questions.map((question, index) => ({
            ...question,
            select_kind: index === 0 ? 'multi' as const : 'single' as const,
          })),
        };
      },
    };
    renderRoute('/quiz/fpt-m1', 'fully-complete', testAuthProvider(signedInSession), mixedProvider);
    // Per-step counts under the stepper (brief #1). Question 1 is the multi
    // question: checkboxes and no radios. Stepping to question 2 flips it —
    // which is the actual property, that select_kind drives the control.
    expect(await screen.findByText('Select all that apply')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Select one answer')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('uses question points, not question count, for attempt-history denominators', async () => {
    const weightedProvider: LmsDataProvider = {
      ...mockProvider,
      async getQuiz(quizId, learner) {
        const payload = await mockProvider.getQuiz(quizId, learner);
        return {
          ...payload,
          questions: payload.questions.map((question, index) => ({
            ...question,
            points: index === 0 ? 2 : 1,
          })),
        };
      },
    };
    renderRoute('/quiz/fpt-m1', 'fully-complete', testAuthProvider(signedInSession), weightedProvider);
    // Scoped to the attempt-history region. The page-wide /\/10/ guard was
    // valid when the quiz had no other fractions on it; the stepper's progress
    // counter ("0/10 answered") is a different quantity — questions answered,
    // not points scored — and would trip a page-wide match. Scoping keeps the
    // F2 fix guarded: the denominator here must be possible_points (11), never
    // question_count (10).
    const history = await screen.findByRole('complementary');
    expect(await within(history).findByText(/\/11/)).toBeInTheDocument();
    expect(within(history).queryByText(/\/10/)).not.toBeInTheDocument();
  });

  it('keeps the learner snapshot visible when profile save succeeds but refresh fails', async () => {
    let snapshotReads = 0;
    const refreshFailingProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        snapshotReads += 1;
        if (snapshotReads > 1) throw new Error('refresh unavailable');
        return mockProvider.getLearnerSnapshot(learner);
      },
      async updateProfile(profile) {
        return profile;
      },
    };
    renderRoute('/account', 'fully-complete', testAuthProvider(signedInSession), refreshFailingProvider);
    fireEvent.click(await screen.findByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText(/Account details were saved, but refreshed learner data could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Profile and credentials' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows a learner mutation failure without removing the current snapshot', async () => {
    const mutationFailingProvider: LmsDataProvider = {
      ...mockProvider,
      async updateProfile() {
        throw new Error('write failed');
      },
    };
    renderRoute('/account', 'fully-complete', testAuthProvider(signedInSession), mutationFailingProvider);
    fireEvent.click(await screen.findByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText(/Account details could not be saved. No change was confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Profile and credentials' })).toBeInTheDocument();
  });

  it('renders expired access with no date without a 1970 artifact', async () => {
    const nullExpiryProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) => ({
            ...enrollment,
            status: 'expired' as const,
            expires_at: null,
          })),
        };
      },
    };
    renderRoute('/course/fpt-sandbox/module/1', 'fully-complete', testAuthProvider(signedInSession), nullExpiryProvider);
    expect(await screen.findByText(/marked expired without an expiry date/i)).toBeInTheDocument();
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
  });

  it('surfaces password-reset transport failure instead of showing anti-enumeration success', async () => {
    const transportFailingAuth: LmsAuthProvider = {
      ...testAuthProvider(null),
      async requestPasswordReset() {
        return {
          ok: false,
          message: 'Unable to request reset instructions. Check your connection and try again.',
          session: null,
        };
      },
    };
    renderRoute('/reset', 'fresh', transportFailingAuth);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'fresh@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to request reset instructions');
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated protected route to login', async () => {
    renderRoute('/dashboard', 'fully-complete', testAuthProvider(null));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to continue' })).toBeInTheDocument();
  });

  it('sends a cold logged-out root visit to login without loading LMS data', async () => {
    const getCatalog = vi.fn(mockProvider.getCatalog);
    const getLearnerSnapshot = vi.fn(mockProvider.getLearnerSnapshot);
    // The listLearners spy went with the method (M-10). The property under
    // test — a logged-out visit issues no LMS reads — is unchanged, and the
    // two surviving spies are the only reads boot can make.
    const guardedProvider: LmsDataProvider = {
      ...mockProvider,
      getCatalog,
      getLearnerSnapshot,
    };

    renderRoute('/', 'fresh', testAuthProvider(null), guardedProvider);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Sign in to continue',
      }),
    ).toBeInTheDocument();
    expect(getCatalog).not.toHaveBeenCalled();
    expect(getLearnerSnapshot).not.toHaveBeenCalled();
  });
});

describe('D6 operator routes', () => {
  it('hard-redirects a learner away from /admin', async () => {
    renderRoute('/admin', 'fully-complete');
    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Fully\.$/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Operator console')).not.toBeInTheDocument();
  });

  it('renders the operator catalog through the admin provider only', async () => {
    const route = '/admin';
    window.history.replaceState({}, '', route);
    render(
      <MemoryRouter initialEntries={[route]}>
        <AuthSessionProvider provider={testAuthProvider(operatorSession)}>
          <LmsProvider provider={mockProvider}>
            <App adminProvider={mockAdminProvider} />
          </LmsProvider>
        </AuthSessionProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Course catalog' })).toBeInTheDocument();
    // O3 replaced the icon+"Operator console" text lockup with the brand
    // lockup image (BrandLockup). The admin chrome's identity is now the
    // lockup plus the "Operator" role badge; the property under test — that the
    // operator console rendered — is asserted through the badge.
    expect(screen.getByText('Operator')).toBeInTheDocument();
  });

  it('shows pass_pct as read-only published policy', async () => {
    const route = '/admin/course/course-fpt';
    window.history.replaceState({}, '', route);
    render(
      <MemoryRouter initialEntries={[route]}>
        <AuthSessionProvider provider={testAuthProvider(operatorSession)}>
          <LmsProvider provider={mockProvider}>
            <App adminProvider={mockAdminProvider} />
          </LmsProvider>
        </AuthSessionProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByDisplayValue('70%')).toHaveAttribute('readonly');
    expect(screen.getByText(/published program requirement/i)).toBeInTheDocument();
  });

  it('keeps the admin snapshot visible when a mutation succeeds but refresh fails', async () => {
    let catalogReads = 0;
    const refreshFailingAdmin: LmsAdminProvider = {
      async adminRequest<T>(action: string) {
        if (action === 'list_catalog') {
          catalogReads += 1;
          if (catalogReads > 1) throw new Error('refresh unavailable');
          return (await mockProvider.getCatalog()) as T;
        }
        if (action === 'list_audit') return [] as T;
        if (action === 'update_course') return {} as T;
        throw new Error(`Unexpected admin action: ${action}`);
      },
    };
    const route = '/admin/course/course-fpt';
    window.history.replaceState({}, '', route);
    render(
      <MemoryRouter initialEntries={[route]}>
        <AuthSessionProvider provider={testAuthProvider(operatorSession)}>
          <LmsProvider provider={mockProvider}>
            <App adminProvider={refreshFailingAdmin} />
          </LmsProvider>
        </AuthSessionProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save course settings' }));
    expect(await screen.findByText(/update course succeeded, but refreshed admin data could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'FPT Sandbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows an admin mutation failure without removing the current workspace', async () => {
    const mutationFailingAdmin: LmsAdminProvider = {
      async adminRequest<T>(action: string) {
        if (action === 'list_catalog') return (await mockProvider.getCatalog()) as T;
        if (action === 'list_audit') return [] as T;
        if (action === 'update_course') throw new Error('write failed');
        throw new Error(`Unexpected admin action: ${action}`);
      },
    };
    const route = '/admin/course/course-fpt';
    window.history.replaceState({}, '', route);
    render(
      <MemoryRouter initialEntries={[route]}>
        <AuthSessionProvider provider={testAuthProvider(operatorSession)}>
          <LmsProvider provider={mockProvider}>
            <App adminProvider={mutationFailingAdmin} />
          </LmsProvider>
        </AuthSessionProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save course settings' }));
    expect(await screen.findByText(/update course failed. No change was confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'FPT Sandbox' })).toBeInTheDocument();
  });

  it('uploads a text resource and reports confirmed success', async () => {
    const adminRequestCalls = vi.fn();
    const uploadAdminProvider: LmsAdminProvider = {
      async adminRequest<T>(action: string, payload = {}) {
        adminRequestCalls(action, payload);
        if (action === 'list_catalog') return (await mockProvider.getCatalog()) as T;
        if (action === 'list_audit') return [] as T;
        if (action === 'upload_resource') return { id: 'resource-new' } as T;
        throw new Error(`Unexpected admin action: ${action}`);
      },
    };
    const route = '/admin/course/course-fpt';
    window.history.replaceState({}, '', route);
    render(
      <MemoryRouter initialEntries={[route]}>
        <AuthSessionProvider provider={testAuthProvider(operatorSession)}>
          <LmsProvider provider={mockProvider}>
            <App adminProvider={uploadAdminProvider} />
          </LmsProvider>
        </AuthSessionProvider>
      </MemoryRouter>,
    );
    fireEvent.change((await screen.findAllByLabelText('Resource title'))[0], { target: { value: 'Operator guide' } });
    fireEvent.change(screen.getAllByPlaceholderText('Paste sandbox text content when no file is selected.')[0], { target: { value: 'Sandbox resource body' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Upload' })[0]);

    expect(await screen.findByText('Private lesson resource uploaded.')).toBeInTheDocument();
    expect(adminRequestCalls).toHaveBeenCalledWith('upload_resource', expect.objectContaining({
      lesson_id: 'fpt-m1-video',
      title: 'Operator guide',
      file_name: 'sandbox-resource.txt',
    }));
    expect(screen.getByText('upload resource succeeded.')).toBeInTheDocument();
  });
});
