import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { IconTile } from '../components/IconTile';
import {
  MutationStatusBanner,
  type MutationNotice,
} from '../components/MutationStatusBanner';
import { BootSkeleton } from '../components/Skeletons';
import { useAuth } from './AuthContext';
import type {
  LmsPlaybackToken,
  LmsProvider as LmsDataProvider,
  LmsQuizAnswers,
  LmsQuizGradeResult,
  LmsQuizPayload,
  LmsResourceToken,
} from '../data/provider';
import { isLmsAccessDenied } from '../data/provider';
import { supabaseProvider } from '../data/supabaseProvider';
import type {
  Catalog,
  LearnerSnapshot,
  LearnerStateKey,
  LmsLearnerProfile,
  LmsLessonProgress,
} from '../data/types';
import { runMutationLifecycle } from '../lib/mutationStatus';

interface LmsContextValue {
  catalog: Catalog;
  snapshot: LearnerSnapshot;
  loading: boolean;
  acceptTerms: (enrollmentId: string) => Promise<void>;
  saveProfile: (profile: LmsLearnerProfile) => Promise<void>;
  requestPlayback: (lessonId: string) => Promise<LmsPlaybackToken>;
  requestResource: (resourceId: string) => Promise<LmsResourceToken>;
  recordHeartbeat: (
    lessonId: string,
    positionSeconds: number,
  ) => Promise<LmsLessonProgress>;
  completeReading: (lessonId: string) => Promise<LmsLessonProgress>;
  loadQuiz: (quizId: string) => Promise<LmsQuizPayload>;
  submitQuiz: (
    quizId: string,
    answers: LmsQuizAnswers,
  ) => Promise<LmsQuizGradeResult>;
}

const LmsContext = createContext<LmsContextValue | null>(null);

/**
 * M-10. This used to be initialLearner(), which read ?learner= off the URL and
 * let anyone view another synthetic learner's state by editing the address bar.
 *
 * It is a constant now, and it is inert: every supabaseProvider method that
 * takes a learner key ignores it (they are all `_learnerId` or omit the
 * parameter) and scopes to auth.uid() instead, so the deployed app never read
 * this value. It survives only because the LmsProvider interface — frozen —
 * still declares the parameter. mockProvider is the only implementation that
 * honours it, which is why tests bind their own scope.
 */
const LEARNER_SCOPE: LearnerStateKey = 'fresh';

export function LmsProvider({
  children,
  provider = supabaseProvider,
}: {
  children: ReactNode;
  provider?: LmsDataProvider;
}) {
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();
  const publicRoute =
    location.pathname === '/login' ||
    location.pathname === '/reset' ||
    location.pathname.startsWith('/admin');

  if (publicRoute || authLoading || !session) return <>{children}</>;

  return (
    <AuthenticatedLmsProvider key={session.user.id} provider={provider}>
      {children}
    </AuthenticatedLmsProvider>
  );
}

function AuthenticatedLmsProvider({
  children,
  provider,
}: {
  children: ReactNode;
  provider: LmsDataProvider;
}) {
  const { logout } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [snapshot, setSnapshot] = useState<LearnerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'denied' | 'unavailable' | null>(null);
  const [mutationNotice, setMutationNotice] = useState<MutationNotice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadSnapshot = useCallback(async (learner: LearnerStateKey) => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await provider.getLearnerSnapshot(learner);
      setSnapshot(next);
    } catch (error) {
      setLoadError(isLmsAccessDenied(error) ? 'denied' : 'unavailable');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [provider]);

  const refreshLearnerAccess = useCallback(async (learner: LearnerStateKey) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextCatalog, nextSnapshot] = await Promise.all([
        provider.getCatalog(),
        provider.getLearnerSnapshot(learner),
      ]);
      setCatalog(nextCatalog);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setLoadError(isLmsAccessDenied(error) ? 'denied' : 'unavailable');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // M-10: this was Promise.all([getCatalog, listLearners]) and *then*
        // getLearnerSnapshot, two sequential waves, because the snapshot call
        // needed an id that only listLearners could supply. With the switcher
        // gone the id is a constant, so the two independent reads collapse
        // into the single wave refreshLearnerAccess already uses. Strictly
        // fewer requests; no read is newly ordered against another.
        const [nextCatalog, nextSnapshot] = await Promise.all([
          provider.getCatalog(),
          provider.getLearnerSnapshot(LEARNER_SCOPE),
        ]);
        if (!active) return;
        setCatalog(nextCatalog);
        setSnapshot(nextSnapshot);
      } catch (error) {
        if (!active) return;
        setCatalog(null);
        setSnapshot(null);
        setLoadError(isLmsAccessDenied(error) ? 'denied' : 'unavailable');
      } finally {
        if (active) setLoading(false);
      }
    };

    void boot();
    return () => {
      active = false;
    };
  }, [provider, reloadKey]);

  const acceptTerms = useCallback(
    async (enrollmentId: string) => {
      await runMutationLifecycle({
        mutate: () => provider.acceptTerms(enrollmentId),
        // Terms and prerequisites affect which catalog rows RLS exposes.
        refresh: () => refreshLearnerAccess(LEARNER_SCOPE),
        onMutationSuccess: () => setMutationNotice({ kind: 'success', message: 'Terms accepted.' }),
        onMutationFailure: () => setMutationNotice({ kind: 'error', message: 'Terms acceptance failed. No change was confirmed.' }),
        onRefreshFailure: () => setMutationNotice({
          kind: 'warning',
          message: 'Terms were accepted, but updated access could not be loaded. Your current view is still shown.',
          retry: () => void refreshLearnerAccess(LEARNER_SCOPE)
            .then(() => setMutationNotice(null))
            .catch(() => undefined),
        }),
      });
    },
    [provider, refreshLearnerAccess],
  );

  const saveProfile = useCallback(
    async (profile: LmsLearnerProfile) => {
      await runMutationLifecycle({
        mutate: () => provider.updateProfile(profile),
        refresh: () => loadSnapshot(LEARNER_SCOPE),
        onMutationSuccess: () => setMutationNotice({ kind: 'success', message: 'Account details saved.' }),
        onMutationFailure: () => setMutationNotice({ kind: 'error', message: 'Account details could not be saved. No change was confirmed.' }),
        onRefreshFailure: () => setMutationNotice({
          kind: 'warning',
          message: 'Account details were saved, but refreshed learner data could not be loaded. Your current view is still shown.',
          retry: () => void loadSnapshot(LEARNER_SCOPE)
            .then(() => setMutationNotice(null))
            .catch(() => undefined),
        }),
      });
    },
    [loadSnapshot, provider],
  );

  const applyProgress = useCallback((progress: LmsLessonProgress) => {
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        progress: [
          ...current.progress.filter((item) => item.id !== progress.id),
          progress,
        ],
      };
    });
  }, []);

  const requestPlayback = useCallback(
    (lessonId: string) => provider.getPlaybackToken(lessonId, LEARNER_SCOPE),
    [provider],
  );

  const requestResource = useCallback(
    (resourceId: string) => provider.getResourceToken(resourceId, LEARNER_SCOPE),
    [provider],
  );

  const recordHeartbeat = useCallback(
    async (lessonId: string, positionSeconds: number) => {
      return runMutationLifecycle({
        mutate: () => provider.recordHeartbeat(
          lessonId,
          positionSeconds,
          LEARNER_SCOPE,
        ),
        refresh: async (progress) => applyProgress(progress),
      });
    },
    [applyProgress, provider],
  );

  const completeReading = useCallback(
    async (lessonId: string) => {
      return runMutationLifecycle({
        mutate: () => provider.completeReading(lessonId, LEARNER_SCOPE),
        refresh: async (progress) => applyProgress(progress),
        onMutationSuccess: () => setMutationNotice({ kind: 'success', message: 'Reading marked complete.' }),
        onMutationFailure: () => setMutationNotice({ kind: 'error', message: 'Reading completion could not be saved. No change was confirmed.' }),
      });
    },
    [applyProgress, provider],
  );

  const loadQuiz = useCallback(
    (quizId: string) => provider.getQuiz(quizId, LEARNER_SCOPE),
    [provider],
  );

  const submitQuiz = useCallback(
    async (quizId: string, answers: LmsQuizAnswers) => {
      return runMutationLifecycle({
        mutate: () => provider.gradeQuiz(quizId, answers, LEARNER_SCOPE),
        refresh: (result) => result.completion_fired
          // A completion event can expose a prerequisite-gated course through RLS.
          ? refreshLearnerAccess(LEARNER_SCOPE)
          : loadSnapshot(LEARNER_SCOPE),
        onMutationFailure: () => setMutationNotice({
          kind: 'error',
          message: 'Checkpoint submission failed. Your selections remain on this page so you can try again.',
        }),
        onRefreshFailure: (_error, result) => setMutationNotice({
          kind: 'warning',
          message: 'The checkpoint was graded, but updated progress could not be loaded. Your current view and result are still shown.',
          retry: () => void (result.completion_fired
            ? refreshLearnerAccess(LEARNER_SCOPE)
            : loadSnapshot(LEARNER_SCOPE))
            .then(() => setMutationNotice(null))
            .catch(() => undefined),
        }),
      });
    },
    [loadSnapshot, provider, refreshLearnerAccess],
  );

  const value = useMemo(
    () =>
      catalog && snapshot
        ? {
            catalog,
            snapshot,
            loading,
            acceptTerms,
            saveProfile,
            requestPlayback,
            requestResource,
            recordHeartbeat,
            completeReading,
            loadQuiz,
            submitQuiz,
          }
        : null,
    [
      acceptTerms,
      catalog,
      loading,
      completeReading,
      loadQuiz,
      recordHeartbeat,
      requestPlayback,
      requestResource,
      saveProfile,
      snapshot,
      submitQuiz,
    ],
  );

  if (!value) {
    if (loadError) {
      const denied = loadError === 'denied';
      return (
        <main className="grid min-h-dvh place-items-center bg-dacfp-wash px-4 py-12">
          {/* A page-level error region, not an inline alert: role="alert" stays
              on the section so the whole recovery story is announced. */}
          <section className="card w-full max-w-xl p-6 text-center sm:p-8" role="alert">
            <IconTile icon={AlertTriangle} size="lg" tone="gold" className="mx-auto" />
            <p className="eyebrow mt-5">{denied ? 'No learner access' : 'Connection issue'}</p>
            <h1 className="mt-2 text-2xl font-bold text-dacfp-navy">
              {denied ? 'Learning access is unavailable' : 'We could not load the learning portal'}
            </h1>
            <p className="mx-auto mt-3 max-w-md leading-7 text-dacfp-gray-text">
              {denied
                ? 'Your session is valid, but it does not currently have learner access. Sign in again or contact DACFP support if this continues.'
                : 'Check your connection and try again. Your course progress has not been changed.'}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                className="button-primary"
                onClick={() => setReloadKey((current) => current + 1)}
                type="button"
              >
                <RefreshCw className="size-icon-sm" aria-hidden="true" />
                Retry loading
              </button>
              <button
                className="button-secondary"
                onClick={() => void logout()}
                type="button"
              >
                <LogOut className="size-icon-sm" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </section>
        </main>
      );
    }

    // brief #15: boot skeleton. This was one centred line of text, which on a
    // slow connection is indistinguishable from a stalled page.
    return <BootSkeleton />;
  }

  return (
    <LmsContext.Provider value={value}>
      <MutationStatusBanner notice={mutationNotice} onDismiss={() => setMutationNotice(null)} />
      {children}
    </LmsContext.Provider>
  );
}

export function useLms() {
  const value = useContext(LmsContext);
  if (!value) throw new Error('useLms must be used within LmsProvider.');
  return value;
}
