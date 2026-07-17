import { fireEvent, render, screen } from '@testing-library/react';
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

function renderRoute(
  path: string,
  learner = 'fully-complete',
  authProvider = testAuthProvider(signedInSession),
  dataProvider: LmsDataProvider = mockProvider,
) {
  const separator = path.includes('?') ? '&' : '?';
  const route = `${path}${separator}learner=${learner}`;
  window.history.replaceState({}, '', route);
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthSessionProvider provider={authProvider}>
        <LmsProvider provider={dataProvider}>
          <App />
        </LmsProvider>
      </AuthSessionProvider>
    </MemoryRouter>,
  );
}

describe('D0 route shell', () => {
  it.each([
    ['/login', 'Sign in to continue'],
    ['/reset', 'Reset your password'],
    ['/dashboard', 'Welcome, Fully complete'],
    ['/course/fpt-sandbox/module/1', 'Bitcoin Foundations'],
    ['/lesson/fpt-m1-video', 'Bitcoin Foundations: Video lesson'],
    ['/quiz/fpt-m1', 'Bitcoin Foundations quiz'],
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
    expect(await screen.findByText('Available')).toBeInTheDocument();
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it.each([
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
    fireEvent.click(await screen.findByRole('button', { name: 'Submit attempt' }));
    expect(await screen.findByText('7/10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake quiz' })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Submit attempt' }));
    expect(await screen.findByText('Module 4 unlocked. You can continue immediately.')).toBeInTheDocument();
  });

  it('redirects an unauthenticated protected route to login', async () => {
    renderRoute('/dashboard', 'fully-complete', testAuthProvider(null));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to continue' })).toBeInTheDocument();
  });

  it('sends a cold logged-out root visit to login without loading LMS data', async () => {
    const getCatalog = vi.fn(mockProvider.getCatalog);
    const listLearners = vi.fn(mockProvider.listLearners);
    const getLearnerSnapshot = vi.fn(mockProvider.getLearnerSnapshot);
    const guardedProvider: LmsDataProvider = {
      ...mockProvider,
      getCatalog,
      listLearners,
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
    expect(listLearners).not.toHaveBeenCalled();
    expect(getLearnerSnapshot).not.toHaveBeenCalled();
  });
});

describe('D6 operator routes', () => {
  it('hard-redirects a learner away from /admin', async () => {
    renderRoute('/admin', 'fully-complete');
    expect(await screen.findByRole('heading', { name: 'Welcome, Fully complete' })).toBeInTheDocument();
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
    expect(screen.getByText('Operator console')).toBeInTheDocument();
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
});
