import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { mockProvider } from '../data/mockProvider';
import type {
  Catalog,
  LearnerSnapshot,
  LearnerStateKey,
  LearnerSummary,
  LmsLearnerProfile,
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
}

const LmsContext = createContext<LmsContextValue | null>(null);

function initialLearner(): LearnerStateKey {
  const candidate = new URLSearchParams(window.location.search).get('learner');
  return learnerStateKeys.includes(candidate as LearnerStateKey)
    ? (candidate as LearnerStateKey)
    : 'fresh';
}

export function LmsProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [selectedLearner, setSelectedLearner] = useState<LearnerStateKey>(initialLearner);
  const [snapshot, setSnapshot] = useState<LearnerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(async (learner: LearnerStateKey) => {
    setLoading(true);
    const next = await mockProvider.getLearnerSnapshot(learner);
    setSnapshot(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.all([mockProvider.getCatalog(), mockProvider.listLearners()]).then(
      ([nextCatalog, nextLearners]) => {
        setCatalog(nextCatalog);
        setLearners(nextLearners);
      },
    );
  }, []);

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
      await mockProvider.acceptTerms(enrollmentId);
      await loadSnapshot(selectedLearner);
    },
    [loadSnapshot, selectedLearner],
  );

  const saveProfile = useCallback(
    async (profile: LmsLearnerProfile) => {
      await mockProvider.updateProfile(profile);
      await loadSnapshot(selectedLearner);
    },
    [loadSnapshot, selectedLearner],
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
          }
        : null,
    [
      acceptTerms,
      catalog,
      learners,
      loading,
      saveProfile,
      selectedLearner,
      selectLearner,
      snapshot,
    ],
  );

  if (!value) {
    return (
      <div className="grid min-h-dvh place-items-center bg-dacfp-wash px-6">
        <p className="text-sm font-semibold text-brand-navy" role="status">
          Loading the synthetic learning portal…
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
