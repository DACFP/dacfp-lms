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
import {
  MutationStatusBanner,
  type MutationNotice,
} from '../components/MutationStatusBanner';
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
  LearnerSummary,
  LmsLearnerProfile,
  LmsLessonProgress,
} from '../data/types';
import { learnerStateKeys } from '../data/types';
import { runMutationLifecycle } from '../lib/mutationStatus';

interface LmsContextValue {
  catalog: Catalog;
  learners: LearnerSummary[];
  snapshot: LearnerSnapshot;
  selectedLearner: LearnerStateKey;
  loading: boolean;
  selectLearner: (learner: LearnerStateKey) => void;
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

function initialLearner(): LearnerStateKey {
  const candidate = new URLSearchParams(window.location.search).get('learner');
  return learnerStateKeys.includes(candidate as LearnerStateKey)
    ? (candidate as LearnerStateKey)
    : 'fresh';
}

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
  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [selectedLearner, setSelectedLearner] = useState<LearnerStateKey>(initialLearner);
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
        const [nextCatalog, nextLearners] = await Promise.all([
          provider.getCatalog(),
          provider.listLearners(),
        ]);
        const nextLearner = nextLearners.some(
          (learner) => learner.id === selectedLearner,
        )
          ? selectedLearner
          : nextLearners[0]?.id;
        if (!nextLearner) {
          throw new Error('No learner profile is available.');
        }
        const nextSnapshot = await provider.getLearnerSnapshot(nextLearner);
        if (!active) return;
        setCatalog(nextCatalog);
        setLearners(nextLearners);
        setSelectedLearner(nextLearner);
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

  const selectLearner = useCallback((learner: LearnerStateKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set('learner', learner);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSelectedLearner(learner);
    setSnapshot(null);
    void loadSnapshot(learner).catch(() => undefined);
  }, [loadSnapshot]);

  const acceptTerms = useCallback(
    async (enrollmentId: string) => {
      await runMutationLifecycle({
        mutate: () => provider.acceptTerms(enrollmentId),
        // Terms and prerequisites affect which catalog rows RLS exposes.
        refresh: () => refreshLearnerAccess(selectedLearner),
        onMutationSuccess: () => setMutationNotice({ kind: 'success', message: 'Terms accepted.' }),
        onMutationFailure: () => setMutationNotice({ kind: 'error', message: 'Terms acceptance failed. No change was confirmed.' }),
        onRefreshFailure: () => setMutationNotice({
          kind: 'warning',
          message: 'Terms were accepted, but updated access could not be loaded. Your current view is still shown.',
          retry: () => void refreshLearnerAccess(selectedLearner)
            .then(() => setMutationNotice(null))
            .catch(() => undefined),
        }),
      });
    },
    [provider, refreshLearnerAccess, selectedLearner],
  );

  const saveProfile = useCallback(
    async (profile: LmsLearnerProfile) => {
      await runMutationLifecycle({
        mutate: () => provider.updateProfile(profile),
        refresh: () => loadSnapshot(selectedLearner),
        onMutationSuccess: () => setMutationNotice({ kind: 'success', message: 'Account details saved.' }),
        onMutationFailure: () => setMutationNotice({ kind: 'error', message: 'Account details could not be saved. No change was confirmed.' }),
        onRefreshFailure: () => setMutationNotice({
          kind: 'warning',
          message: 'Account details were saved, but refreshed learner data could not be loaded. Your current view is still shown.',
          retry: () => void loadSnapshot(selectedLearner)
            .then(() => setMutationNotice(null))
            .catch(() => undefined),
        }),
      });
    },
    [loadSnapshot, provider, selectedLearner],
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
    (lessonId: string) => provider.getPlaybackToken(lessonId, selectedLearner),
    [provider, selectedLearner],
  );

  const requestResource = useCallback(
    (resourceId: string) => provider.getResourceToken(resourceId, selectedLearner),
    [provider, selectedLearner],
  );

  const recordHeartbeat = useCallback(
    async (lessonId: string, positionSeconds: number) => {
      return runMutationLifecycle({
        mutate: () => provider.recordHeartbeat(
          lessonId,
          positionSeconds,
          selectedLearner,
        ),
        refresh: async (progress) => applyProgress(progress),
      });
    },
    [applyProgress, provider, selectedLearner],
  );

  const completeReading = useCallback(
    async (lessonId: string) => {
      return runMutationLifecycle({
        mutate: () => provider.completeReading(lessonId, selectedLearner),
        refresh: async (progress) => applyProgress(progress),
        onMutationSuccess: () => setMutationNotice({ kind: 'success', message: 'Reading marked complete.' }),
        onMutationFailure: () => setMutationNotice({ kind: 'error', message: 'Reading completion could not be saved. No change was confirmed.' }),
      });
    },
    [applyProgress, provider, selectedLearner],
  );

  const loadQuiz = useCallback(
    (quizId: string) => provider.getQuiz(quizId, selectedLearner),
    [provider, selectedLearner],
  );

  const submitQuiz = useCallback(
    async (quizId: string, answers: LmsQuizAnswers) => {
      return runMutationLifecycle({
        mutate: () => provider.gradeQuiz(quizId, answers, selectedLearner),
        refresh: (result) => result.completion_fired
          // A completion event can expose a prerequisite-gated course through RLS.
          ? refreshLearnerAccess(selectedLearner)
          : loadSnapshot(selectedLearner),
        onMutationFailure: () => setMutationNotice({
          kind: 'error',
          message: 'Quiz submission failed. Your selections remain on this page so you can try again.',
        }),
        onRefreshFailure: (_error, result) => setMutationNotice({
          kind: 'warning',
          message: 'The quiz was graded, but updated progress could not be loaded. Your current view and result are still shown.',
          retry: () => void (result.completion_fired
            ? refreshLearnerAccess(selectedLearner)
            : loadSnapshot(selectedLearner))
            .then(() => setMutationNotice(null))
            .catch(() => undefined),
        }),
      });
    },
    [loadSnapshot, provider, refreshLearnerAccess, selectedLearner],
  );

  const value = useMemo(
    () =>
      catalog && snapshot
        ? {
            catalog,
            learners,
            snapshot,
            selectedLearner,
            loading,
            selectLearner,
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
      learners,
      loading,
      completeReading,
      loadQuiz,
      recordHeartbeat,
      requestPlayback,
      requestResource,
      saveProfile,
      selectedLearner,
      selectLearner,
      snapshot,
      submitQuiz,
    ],
  );

  if (!value) {
    if (loadError) {
      const denied = loadError === 'denied';
      return (
        <main className="grid min-h-dvh place-items-center bg-dacfp-wash px-4 py-12">
          <section className="card w-full max-w-xl p-6 text-center sm:p-8" role="alert">
            <div className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-gold/15 text-brand-navy">
              <AlertTriangle aria-hidden="true" size={24} />
            </div>
            <p className="eyebrow mt-5">{denied ? 'No learner access' : 'Connection issue'}</p>
            <h1 className="mt-2 text-2xl font-bold text-brand-navy">
              {denied ? 'Learning access is unavailable' : 'We could not load the learning portal'}
            </h1>
            <p className="mx-auto mt-3 max-w-md leading-7 text-dacfp-slate">
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
                <RefreshCw aria-hidden="true" size={17} />
                Retry loading
              </button>
              <button
                className="button-secondary"
                onClick={() => void logout()}
                type="button"
              >
                <LogOut aria-hidden="true" size={17} />
                Sign out
              </button>
            </div>
          </section>
        </main>
      );
    }

    return (
      <div className="grid min-h-dvh place-items-center bg-dacfp-wash px-6">
        <p className="text-sm font-semibold text-brand-navy" role="status">
          Loading the learning portal…
        </p>
      </div>
    );
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
