import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AdminSnapshot, LearnerInspection, QuestionBank } from '../data/admin';
import type { LmsAdminProvider } from '../data/provider';
import { supabaseProvider } from '../data/supabaseProvider';

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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, audit] = await Promise.all([
        provider.adminRequest<AdminSnapshot['catalog']>('list_catalog'),
        provider.adminRequest<AdminSnapshot['audit']>('list_audit'),
      ]);
      setSnapshot({ catalog, audit });
    } catch {
      setError('Admin data could not be loaded. Retry or sign in again.');
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(async <T,>(action: string, payload: Record<string, unknown>) => {
    const result = await provider.adminRequest<T>(action, payload);
    await refresh();
    return result;
  }, [provider, refresh]);

  const value = useMemo<AdminContextValue | null>(() => snapshot ? {
    ...snapshot,
    loading,
    error,
    refresh,
    mutate,
    inspectLearner: (email) => provider.adminRequest<LearnerInspection | null>('inspect_learner', { email }),
    exportQuestionBank: (moduleId) => provider.adminRequest<QuestionBank>('export_question_bank', { module_id: moduleId }),
  } : null, [error, loading, mutate, provider, refresh, snapshot]);

  if (!value) {
    return (
      <main className="grid min-h-dvh place-items-center bg-dacfp-wash px-5">
        <section className="card w-full max-w-lg p-7 text-center" role={error ? 'alert' : 'status'}>
          <p className="eyebrow">Operator console</p>
          <h1 className="mt-2 text-2xl font-bold text-brand-navy">
            {error ? 'Admin data unavailable' : 'Loading admin workspace…'}
          </h1>
          {error ? (
            <>
              <p className="mt-3 text-sm leading-6 text-dacfp-slate">{error}</p>
              <button className="button-primary mt-5" onClick={() => void refresh()} type="button">Retry</button>
            </>
          ) : null}
        </section>
      </main>
    );
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside AdminProvider.');
  return value;
}
