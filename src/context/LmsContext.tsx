import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  LmsPlaybackToken,
  LmsProvider as LmsDataProvider,
  LmsQuizAnswers,
  LmsQuizGradeResult,
  LmsQuizPayload,
} from '../data/provider';
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
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [selectedLearner, setSelectedLearner] = useState<LearnerStateKey>(initialLearner);
  const [snapshot, setSnapshot] = useState<LearnerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(async (learner: LearnerStateKey) => {
    setLoading(true);
    const next = await provider.getLearnerSnapshot(learner);
    setSnapshot(next);
    setLoading(false);
  }, [provider]);

  useEffect(() => {
    void Promise.all([provider.getCatalog(), provider.listLearners()]).then(
      ([nextCatalog, nextLearners]) => {
        setCatalog(nextCatalog);
        setLearners(nextLearners);
        if (nextLearners.length === 1) setSelectedLearner(nextLearners[0].id);
      },
    );
  }, [provider]);

  useEffect(() => {
    void loadSnapshot(selectedLearner);
  }, [loadSnapshot, selectedLearner]);

  const selectLearner = useCallback((learner: LearnerStateKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set('learner', learner);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSelectedLearner(learner);
  }, []);

  const acceptTerms = useCallback(
    async (enrollmentId: string) => {
      await provider.acceptTerms(enrollmentId);
      const [nextCatalog] = await Promise.all([
        provider.getCatalog(),
        loadSnapshot(selectedLearner),
      ]);
      setCatalog(nextCatalog);
    },
    [loadSnapshot, provider, selectedLearner],
  );

  const saveProfile = useCallback(
    async (profile: LmsLearnerProfile) => {
      await provider.updateProfile(profile);
      await loadSnapshot(selectedLearner);
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

  const recordHeartbeat = useCallback(
    async (lessonId: string, positionSeconds: number) => {
      const progress = await provider.recordHeartbeat(
        lessonId,
        positionSeconds,
        selectedLearner,
      );
      applyProgress(progress);
      return progress;
    },
    [applyProgress, provider, selectedLearner],
  );

  const completeReading = useCallback(
    async (lessonId: string) => {
      const progress = await provider.completeReading(lessonId, selectedLearner);
      applyProgress(progress);
      return progress;
    },
    [applyProgress, provider, selectedLearner],
  );

  const loadQuiz = useCallback(
    (quizId: string) => provider.getQuiz(quizId, selectedLearner),
    [provider, selectedLearner],
  );

  const submitQuiz = useCallback(
    async (quizId: string, answers: LmsQuizAnswers) => {
      const result = await provider.gradeQuiz(quizId, answers, selectedLearner);
      await loadSnapshot(selectedLearner);
      return result;
    },
    [loadSnapshot, provider, selectedLearner],
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
      saveProfile,
      selectedLearner,
      selectLearner,
      snapshot,
      submitQuiz,
    ],
  );

  if (!value) {
    return (
      <div className="grid min-h-dvh place-items-center bg-dacfp-wash px-6">
        <p className="text-sm font-semibold text-brand-navy" role="status">
          Loading the learning portal…
        </p>
      </div>
    );
  }

  return <LmsContext.Provider value={value}>{children}</LmsContext.Provider>;
}

export function useLms() {
  const value = useContext(LmsContext);
  if (!value) throw new Error('useLms must be used within LmsProvider.');
  return value;
}
