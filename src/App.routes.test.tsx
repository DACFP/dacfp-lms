import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function loginAuthProvider(session: LmsAuthSession): LmsAuthProvider {
  return {
    ...testAuthProvider(null),
    async login() {
      return { ok: true, message: 'Signed in.', session };
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

function renderLoginState(
  state: { from: string; actor: 'learner' | 'operator' },
  authProvider: LmsAuthProvider,
  adminProvider?: LmsAdminProvider,
) {
  window.history.replaceState({}, '', '/login');
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <AuthSessionProvider provider={authProvider}>
        <LmsProvider provider={scopedProvider(mockProvider, 'mid-module-2')}>
          <App adminProvider={adminProvider} />
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
    ['/reset', 'Reset your password'],
    // T1: the dashboard greets by first name in the mockup's register, and the
    // greeting tracks time of day — hence the regex.
    ['/dashboard', /^Good (morning|afternoon|evening), Fully\.$/],
    ['/course/fpt-sandbox/module/1', 'Bitcoin Foundations'],
    ['/lesson/fpt-m1-video', 'Bitcoin Foundations: Video lesson'],
    ['/quiz/fpt-m1', 'Module 1 quiz'],
    ['/account', 'Profile and credentials'],
    ['/credentials', 'My Credentials'],
    ['/certificate', 'My Credentials'],
    ['/completion/fpt-sandbox', 'You completed the course'],
  ])('renders %s on mock data', async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('renders login for an unauthenticated visitor', async () => {
    renderRoute('/login', 'fresh', testAuthProvider(null));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to continue' }),
    ).toBeInTheDocument();
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
    ['/quiz/fpt-m4', 'quiz-failed-on-3', 'Quiz unavailable'],
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

  it('keeps the bonus library entirely invisible until the FPT completion event exists', async () => {
    renderRoute('/dashboard', 'fresh');
    expect(await screen.findByRole('dialog', { name: 'Accept the program terms to continue' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bonus library' })).not.toBeInTheDocument();
    expect(screen.queryByText('Crypto Custody and Security')).not.toBeInTheDocument();
    expect(screen.queryByText('Renewal 2026 Sandbox')).not.toBeInTheDocument();
  });

  it('shows all six bonus-course cards after FPT completion and keeps renewal hidden outside its window', async () => {
    renderRoute('/dashboard', 'fpt-completed');
    expect(await screen.findByRole('heading', { name: 'Bonus library' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crypto Custody and Security' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spot Ethereum ETFs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'NFTs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'DeFi and DAOs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Staking, Lending and Borrowing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GENIUS Act' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Renewal 2026 Sandbox' })).not.toBeInTheDocument();
  });

  it('shows renewal only for the staged learner inside the 30-day window', async () => {
    renderRoute('/dashboard', 'near-expiry');
    expect(await screen.findByRole('heading', { name: 'Renewal 2026 Sandbox' })).toBeInTheDocument();
  });

  it.each([
    ['mid-module-2', '2/5', 'On certification'],
    ['fpt-completed', '5/5', 'Jul 16, 2027'],
  ] as const)('renders the X1 header stats for %s', async (learner, modules, designation) => {
    renderRoute('/dashboard', learner);
    expect(await screen.findByText(modules)).toBeInTheDocument();
    expect(screen.getByText('Modules')).toBeInTheDocument();
    expect(screen.getByText('Enrollment remaining')).toBeInTheDocument();
    expect(screen.getAllByText(designation).length).toBeGreaterThan(0);
  });

  it('shows the completion contract and lets the learner collapse it', async () => {
    window.localStorage.clear();
    renderRoute('/dashboard', 'mid-module-2');
    expect(await screen.findByRole('heading', { name: 'How you earn the CBDA' })).toBeInTheDocument();
    expect(screen.getByText('Pass each 10-question quiz at 70%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByText('5 modules · 70% per quiz · unlimited attempts · no final exam')).toBeInTheDocument();
    expect(screen.queryByText('Pass each 10-question quiz at 70%')).not.toBeInTheDocument();
  });

  it('gives a returner an exact memory cue plus resume and replay actions', async () => {
    renderRoute('/dashboard', 'mid-module-2');
    expect(
      await screen.findByRole('heading', {
        name: 'Welcome back — you stopped 4:00 into Module 2: Blockchain and DLT: Video lesson.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Resume/ })).toHaveAttribute('href', '/lesson/fpt-m2-video');
    expect(screen.getByRole('link', { name: 'Replay last 30s' })).toHaveAttribute('href', '/lesson/fpt-m2-video?replay=30');
  });

  it('keeps a collapsible module lesson checklist in the player view', async () => {
    renderRoute('/lesson/fpt-m2-video', 'mid-module-2');
    expect(await screen.findByText('Module 2 of 4 · lesson checklist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Blockchain and DLT: Reading/ })).toBeInTheDocument();
    expect(screen.getByText('0/3 complete')).toBeInTheDocument();
  });

  it('names and links the exact blocking quiz for a locked module', async () => {
    renderRoute('/course/fpt-sandbox/module/4', 'quiz-failed-on-3');
    expect(
      await screen.findByText("Pass Module 3's quiz to unlock Module 4."),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Module 3 quiz' })).toHaveAttribute('href', '/quiz/fpt-m3');
  });

  it('renders the completed learner checklist and credential reveal', async () => {
    renderRoute('/completion/fpt-sandbox', 'fpt-completed');
    expect(await screen.findByRole('heading', { name: 'You completed the course' })).toBeInTheDocument();
    expect(screen.getByText('5/5')).toBeInTheDocument();
    expect(screen.getByText('4/4')).toBeInTheDocument();
    expect(screen.getByText('FPT completed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your interim CBDA credential is ready' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open My Credentials' })).toHaveAttribute('href', '/credentials');
    expect(screen.queryByRole('heading', { name: 'CE reporting status' })).not.toBeInTheDocument();
  });

  it('renders the interim certificate only after FPT completion', async () => {
    renderRoute('/certificate', 'mid-module-2');
    expect(await screen.findByRole('heading', { level: 1, name: 'My Credentials' })).toBeInTheDocument();
    expect(await screen.findByText('Certificate not available yet')).toBeInTheDocument();
  });

  it('renders a completed learner interim certificate with designation dates', async () => {
    renderRoute('/certificate', 'fpt-completed');
    expect(await screen.findByRole('heading', { level: 1, name: 'My Credentials' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'FPT completed' })).toBeInTheDocument();
    expect(screen.getByText('Certified in Blockchain and Digital Assets')).toBeInTheDocument();
    expect(screen.getByText('Interim demonstration certificate')).toBeInTheDocument();
    expect(screen.getByText('Jul 16, 2026')).toBeInTheDocument();
    expect(screen.getByText('Jul 16, 2027')).toBeInTheDocument();
  });

  it('opens every course module for review after course completion', async () => {
    renderRoute('/course/fpt-sandbox/module/4', 'fpt-completed');
    expect(await screen.findByText('Course complete: every module and lesson is open for review in any order.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bitcoin Foundations/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Blockchain and DLT/ })).toBeInTheDocument();
  });

  it('keeps the module page quiz-focused and removes learner CE chips', async () => {
    renderRoute('/course/fpt-sandbox/module/2', 'mid-module-2');
    expect(await screen.findByText("Opens when this module's lessons are complete.")).toBeInTheDocument();
    expect(screen.getByText('10 questions, 70% or higher, unlimited attempts, no final exam.')).toBeInTheDocument();
    expect(screen.queryByText(/CE credit/i)).not.toBeInTheDocument();
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
    expect((await screen.findAllByText(/Access expired/)).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Learning access and designation status are governed separately.')
        .length,
    ).toBeGreaterThan(0);
  });

  it('keeps an expired enrollment visible when RLS hides its course metadata', async () => {
    const hiddenExpiredProvider: LmsDataProvider = {
      ...mockProvider,
      async getCatalog() {
        return {
          courses: [],
          modules: [],
          lessons: [],
          resources: [],
          quizzes: [],
          surveySections: [],
          surveyQuestions: [],
        };
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
    expect(
      (await screen.findAllByRole('heading', {
        name: 'This course is no longer available — contact support',
      })).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Course access unavailable')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Contact support' }).length).toBeGreaterThan(0);
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
    expect(screen.getByLabelText('Middle name')).toBeInTheDocument();
  });

  it('hides CFP reporting state before certification', async () => {
    renderRoute('/account', 'mid-module-2');
    expect(await screen.findByRole('heading', { name: 'Profile and credentials' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'CE reporting' })).toBeNull();
  });

  it('asks a certified learner for a missing CFP Board ID', async () => {
    renderRoute('/account', 'fpt-completed');
    expect(await screen.findByText('Add and save your CFP Board ID to be included')).toBeInTheDocument();
  });

  it('shows the frozen report-run date to a reported learner', async () => {
    renderRoute('/account', 'fully-complete');
    expect(await screen.findByText(/Reported to CFP Board on/)).toBeInTheDocument();
    expect(screen.getAllByText(/Reporting scheduled — DACFP reports within 14 days/).length).toBeGreaterThan(0);
    expect(screen.getByText('CE reporting for this course is not yet available')).toBeInTheDocument();
  });

  it('round-trips the expanded account fields through the profile provider', async () => {
    let current = await mockProvider.getLearnerSnapshot('fully-complete');
    const updateProfile = vi.fn(async (profile) => {
      const saved = { ...profile, updated_at: '2026-07-25T06:00:00.000Z' };
      current = { ...current, profile: saved };
      return saved;
    });
    const profileProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot() {
        return structuredClone(current);
      },
      updateProfile,
    };
    renderRoute('/account', 'fully-complete', testAuthProvider(signedInSession), profileProvider);
    fireEvent.change(await screen.findByLabelText('First name'), { target: { value: 'Casey' } });
    fireEvent.change(screen.getByLabelText('Middle name'), { target: { value: 'Avery' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByLabelText('Firm'), { target: { value: 'Synthetic Planning LLC' } });
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Other' } });
    fireEvent.change(screen.getByLabelText('Other job title'), { target: { value: 'Education Lead' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+1 555 0100' } });
    fireEvent.change(screen.getByLabelText('Firm website'), { target: { value: 'https://example.test' } });
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '100 Test Way' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      display_name: 'Casey Morgan',
      first_name: 'Casey',
      middle_name: 'Avery',
      last_name: 'Morgan',
      firm: 'Synthetic Planning LLC',
      job_title: 'Education Lead',
      phone: '+1 555 0100',
      firm_url: 'https://example.test',
      address: { line1: '100 Test Way' },
    }));
  });

  it('submits the expanded low-friction signup fields to auth', async () => {
    const signUp = vi.fn(async () => ({ ok: true, message: 'Account created.', session: null }));
    renderRoute('/login', 'fresh', { ...testAuthProvider(null), signUp });
    fireEvent.click(await screen.findByRole('button', { name: 'Create account', pressed: false }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Taylor' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lee' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'taylor@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-pass' } });
    fireEvent.change(screen.getByLabelText('Firm'), { target: { value: 'Synthetic Advisory LLC' } });
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Financial Advisor' } });
    const submit = screen.getAllByRole('button', { name: 'Create account' }).find((button) => button.getAttribute('type') === 'submit');
    expect(submit).toBeDefined();
    fireEvent.click(submit!);

    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      email: 'taylor@example.test',
      password: 'synthetic-pass',
      firstName: 'Taylor',
      lastName: 'Lee',
      firm: 'Synthetic Advisory LLC',
      jobTitle: 'Financial Advisor',
    }));
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
    expect(await screen.findByRole('heading', { name: 'Passed — 7/10' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View completion/ })).toBeInTheDocument();
    expect(screen.getByText('Every requirement is complete')).toBeInTheDocument();
    expect(screen.getByText(/Crypto Custody and Security.*unlocked on your dashboard/i)).toBeInTheDocument();
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it('shows the authored next-module bridge when a quiz passes', async () => {
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
    expect(await screen.findByRole('heading', { name: 'Module 4: Layer 2, Tokens, and DeFi' })).toBeInTheDocument();
    expect(screen.getByText(/Connect scaling, tokens, and DeFi/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start Module 4/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Save and exit' })).toBeInTheDocument();
  });

  it('uses guided recovery as the only failed-quiz actions', async () => {
    const quizProvider: LmsDataProvider = {
      ...mockProvider,
      async gradeQuiz() {
        return {
          attempt_number: 2,
          score: 6,
          possible_points: 10,
          passed: false,
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
    expect(await screen.findByRole('heading', { name: 'Not yet — 6/10 · 7/10 required' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review lessons' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry quiz' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Start Module/ })).not.toBeInTheDocument();
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
    expect(
      await screen.findByRole('heading', { name: 'Access expired' }),
    ).toBeInTheDocument();
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

describe('F5 journey-defect remediation', () => {
  it('uses only the expired FPT enrollment for dashboard dates and removes Resume', async () => {
    const expiredFptProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) =>
            enrollment.course_id === 'course-fpt'
              ? {
                  ...enrollment,
                  status: 'expired' as const,
                  expires_at: '2026-01-01T12:00:00.000Z',
                }
              : {
                  ...enrollment,
                  status: 'active' as const,
                  expires_at: '2028-07-16T23:59:59.000Z',
                },
          ),
        };
      },
    };

    renderRoute(
      '/dashboard',
      'mid-module-2',
      testAuthProvider(signedInSession),
      expiredFptProvider,
    );

    expect(
      (await screen.findAllByText('Access expired Jan 1, 2026')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'What you keep' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Restore course access' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Resume/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/2028/)).not.toBeInTheDocument();
  });

  it('renders the same designed expired state on a lesson route', async () => {
    const expiredLessonProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) =>
            enrollment.course_id === 'course-fpt'
              ? {
                  ...enrollment,
                  status: 'expired' as const,
                  expires_at: '2026-01-01T12:00:00.000Z',
                }
              : enrollment,
          ),
        };
      },
    };

    renderRoute(
      '/lesson/fpt-m2-video',
      'mid-module-2',
      testAuthProvider(signedInSession),
      expiredLessonProvider,
    );

    expect(
      await screen.findByRole('heading', { name: 'Access expired Jan 1, 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What you keep' })).toBeInTheDocument();
    expect(screen.queryByText('Resume at')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument();
  });

  it('collapses locked module guidance to the Introduction survey once', async () => {
    const introductionBlockerProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        const fpt = snapshot.enrollments.find(
          (enrollment) => enrollment.course_id === 'course-fpt',
        )!;
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) =>
            enrollment.id === fpt.id
              ? {
                  ...enrollment,
                  terms_accepted_at: '2026-07-16T16:05:00.000Z',
                }
              : enrollment,
          ),
          progress: [
            ...snapshot.progress,
            {
              id: 'fresh-intro-video-complete',
              enrollment_id: fpt.id,
              lesson_id: 'fpt-intro-video',
              started_at: '2026-07-16T16:10:00.000Z',
              completed_at: '2026-07-16T16:12:00.000Z',
              last_position_seconds: 120,
              max_watched_seconds: 120,
              max_watched_updated_at: '2026-07-16T16:12:00.000Z',
              updated_at: '2026-07-16T16:12:00.000Z',
            },
          ],
        };
      },
    };

    renderRoute(
      '/dashboard',
      'fresh',
      testAuthProvider(signedInSession),
      introductionBlockerProvider,
    );

    const message =
      'Complete the Introduction survey “Pre-course survey” to unlock Module 1.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Open Introduction survey' })).toHaveAttribute(
      'href',
      '/lesson/fpt-pre-course-survey',
    );
    expect(screen.queryByText(/Introduction.+quiz/i)).not.toBeInTheDocument();
  });

  it('redirects authenticated learner and operator visits away from login', async () => {
    renderRoute('/login', 'mid-module-2', testAuthProvider(signedInSession));
    expect(
      await screen.findByRole('heading', {
        name: /^Good (morning|afternoon|evening), Mid-module\.$/,
      }),
    ).toBeInTheDocument();
  });

  it('redirects an authenticated operator visit from login to the operator home', async () => {
    renderLoginState(
      { from: '/admin', actor: 'operator' },
      testAuthProvider(operatorSession),
      mockAdminProvider,
    );
    expect(
      await screen.findByRole('heading', { name: 'Course catalog' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in to continue' })).not.toBeInTheDocument();
  });

  it('drops inherited operator routes when a learner signs in', async () => {
    renderLoginState(
      { from: '/admin/learners', actor: 'operator' },
      loginAuthProvider(signedInSession),
    );
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'complete@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'Sign in' })
        .find((button) => button.getAttribute('type') === 'submit')!,
    );

    expect(
      await screen.findByRole('heading', {
        name: /^Good (morning|afternoon|evening), Mid-module\.$/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Learners')).not.toBeInTheDocument();
  });

  it('drops inherited learner routes when an operator signs in', async () => {
    renderLoginState(
      { from: '/lesson/fpt-m2-video', actor: 'learner' },
      loginAuthProvider(operatorSession),
      mockAdminProvider,
    );
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'operator@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'Sign in' })
        .find((button) => button.getAttribute('type') === 'submit')!,
    );

    expect(
      await screen.findByRole('heading', { name: 'Course catalog' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Blockchain and DLT: Video lesson' }),
    ).not.toBeInTheDocument();
  });

  it('renders one precise orphan-course state on fptcomplete', async () => {
    const orphanProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        const fpt = snapshot.enrollments.find(
          (enrollment) => enrollment.course_id === 'course-fpt',
        )!;
        return {
          ...snapshot,
          enrollments: [
            ...snapshot.enrollments,
            {
              ...fpt,
              id: 'fpt-completed-orphan-enrollment',
              course_id: 'course-retired-fpt',
            },
          ],
        };
      },
    };

    renderRoute(
      '/dashboard',
      'fpt-completed',
      testAuthProvider(signedInSession),
      orphanProvider,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'This course is no longer available — contact support',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Course access unavailable')).not.toBeInTheDocument();
  });

  it('uses a day-granularity headline inside 31 days', async () => {
    const expiry = new Date(Date.now() + 12 * 86_400_000).toISOString();
    const nearExpiryProvider: LmsDataProvider = {
      ...mockProvider,
      async getLearnerSnapshot(learner) {
        const snapshot = await mockProvider.getLearnerSnapshot(learner);
        return {
          ...snapshot,
          enrollments: snapshot.enrollments.map((enrollment) =>
            enrollment.course_id === 'course-fpt'
              ? { ...enrollment, status: 'active' as const, expires_at: expiry }
              : enrollment,
          ),
        };
      },
    };

    renderRoute(
      '/dashboard',
      'near-expiry',
      testAuthProvider(signedInSession),
      nearExpiryProvider,
    );

    expect(
      await screen.findByRole('heading', { name: '12 days remaining' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('0 months remaining')).not.toBeInTheDocument();
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
      lesson_id: 'fpt-intro-video',
      title: 'Operator guide',
      file_name: 'sandbox-resource.txt',
    }));
    expect(screen.getByText('upload resource succeeded.')).toBeInTheDocument();
  }, 10_000);
});
