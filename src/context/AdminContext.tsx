import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  MutationStatusBanner,
  type MutationNotice,
} from '../components/MutationStatusBanner';
import { SessionExpiredDialog } from '../components/SessionExpiredDialog';
import type { AdminSnapshot, LearnerInspection, QuestionBank } from '../data/admin';
import type { LmsAdminProvider } from '../data/provider';
import { isLmsAccessDenied } from '../data/provider';
import { supabaseProvider } from '../data/supabaseProvider';
import { runMutationLifecycle } from '../lib/mutationStatus';

interface AdminContextValue extends AdminSnapshot {
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  mutate: <T>(action: string, payload: Record<string, unknown>) => Promise<T>;
  inspectLearner: (email: string) => Promise<LearnerInspection | null>;
  exportQuestionBank: (moduleId: string) => Promise<QuestionBank>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  children,
  provider = supabaseProvider,
}: {
  children: ReactNode;
  provider?: LmsAdminProvider;
}) {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mutationNotice, setMutationNotice] = useState<MutationNotice | null>(null);
  // L-11 (UI only): a denied error means the operator session is no longer
  // authorised, not that data is momentarily unavailable. Classifying it here
  // reads the already-caught error — no fetching sequence changes.
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadAdminSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, audit] = await Promise.all([
        provider.adminRequest<AdminSnapshot['catalog']>('list_catalog'),
        provider.adminRequest<AdminSnapshot['audit']>('list_audit'),
      ]);
      setSnapshot({ catalog, audit });
    } finally {
      setLoading(false);
    }
  }, [provider]);

  const refresh = useCallback(async () => {
    setError('');
    try {
      await loadAdminSnapshot();
      setMutationNotice(null);
    } catch (refreshError) {
      // L-11: an expired session surfaces the re-auth prompt, not a Retry that
      // cannot succeed. Every other failure keeps the existing recoverable path.
      if (isLmsAccessDenied(refreshError)) {
        setSessionExpired(true);
      } else {
        setError('Admin data could not be loaded. Retry or sign in again.');
        setMutationNotice({
          kind: 'warning',
          message: 'Admin data could not be refreshed. The last loaded workspace is still shown.',
          retry: () => void refresh().catch(() => undefined),
        });
      }
      throw refreshError;
    }
  }, [loadAdminSnapshot]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const mutate = useCallback(async <T,>(action: string, payload: Record<string, unknown>) => {
    const label = action.replaceAll('_', ' ');
    return runMutationLifecycle({
      mutate: () => provider.adminRequest<T>(action, payload),
      refresh: () => loadAdminSnapshot(),
      onMutationSuccess: () => setMutationNotice({
        kind: 'success',
        message: `${label} succeeded.`,
      }),
      onMutationFailure: (mutationError) => {
        // L-11: a denied mutation is an expired session, not a failed write.
        if (isLmsAccessDenied(mutationError)) {
          setSessionExpired(true);
          return;
        }
        setMutationNotice({
          kind: 'error',
          message: `${label} failed. No change was confirmed.`,
        });
      },
      onRefreshFailure: () => setMutationNotice({
        kind: 'warning',
        message: `${label} succeeded, but refreshed admin data could not be loaded. The existing workspace is still shown.`,
        retry: () => void refresh().catch(() => undefined),
      }),
    });
  }, [loadAdminSnapshot, provider, refresh]);

  const inspectLearner = useCallback(async (email: string) => {
    try {
      return await provider.adminRequest<LearnerInspection | null>('inspect_learner', { email });
    } catch (readError) {
      if (isLmsAccessDenied(readError)) setSessionExpired(true);
      throw readError;
    }
  }, [provider]);

  const exportQuestionBank = useCallback(async (moduleId: string) => {
    try {
      return await provider.adminRequest<QuestionBank>('export_question_bank', { module_id: moduleId });
    } catch (readError) {
      if (isLmsAccessDenied(readError)) setSessionExpired(true);
      throw readError;
    }
  }, [provider]);

  const value = useMemo<AdminContextValue | null>(() => snapshot ? {
    ...snapshot,
    loading,
    error,
    refresh,
    mutate,
    inspectLearner,
    exportQuestionBank,
  } : null, [error, exportQuestionBank, inspectLearner, loading, mutate, refresh, snapshot]);

  if (!value) {
    // Boot failed before any snapshot loaded. If it was a denied session, the
    // re-auth prompt is the whole story — the generic Retry card cannot help.
    if (sessionExpired) return <SessionExpiredDialog />;
    return (
      <main className="grid min-h-dvh place-items-center bg-dacfp-wash px-5">
        <section className="card w-full max-w-lg p-7 text-center" role={error ? 'alert' : 'status'}>
          <p className="eyebrow">Operator console</p>
          <h1 className="mt-2 text-2xl font-bold text-dacfp-navy">
            {error ? 'Admin data unavailable' : 'Loading admin workspace…'}
          </h1>
          {error ? (
            <>
              <p className="mt-3 text-sm leading-6 text-dacfp-gray-text">{error}</p>
              <button className="button-primary mt-5" onClick={() => void refresh().catch(() => undefined)} type="button">Retry</button>
            </>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <AdminContext.Provider value={value}>
      <MutationStatusBanner notice={mutationNotice} onDismiss={() => setMutationNotice(null)} />
      {children}
      {/* Mid-session expiry: overlays the workspace so nothing the operator sees
          implies the console is still authorised. */}
      {sessionExpired ? <SessionExpiredDialog /> : null}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside AdminProvider.');
  return value;
}
