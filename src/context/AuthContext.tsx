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
  LmsAuthProvider,
  LmsAuthResult,
  LmsAuthSession,
} from '../data/provider';
import { supabaseProvider } from '../data/supabaseProvider';
import { runMutationLifecycle } from '../lib/mutationStatus';

interface AuthContextValue {
  session: LmsAuthSession | null;
  loading: boolean;
  recoveryMode: boolean;
  signUp: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<LmsAuthResult>;
  login: (email: string, password: string) => Promise<LmsAuthResult>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<LmsAuthResult>;
  updatePassword: (password: string) => Promise<LmsAuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthSessionProvider({
  children,
  provider = supabaseProvider,
}: {
  children: ReactNode;
  provider?: LmsAuthProvider;
}) {
  const [session, setSession] = useState<LmsAuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(
    () =>
      new URLSearchParams(window.location.search).get('mode') === 'update' ||
      window.location.hash.includes('type=recovery'),
  );

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const unsubscribe = provider.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authEventSeen = true;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(nextSession);
      setLoading(false);
    });

    void provider
      .getSession()
      .then((nextSession) => {
        if (!active || authEventSeen) return;
        setSession(nextSession);
      })
      .catch(() => {
        if (!active || authEventSeen) return;
        setSession(null);
      })
      .finally(() => {
        if (active && !authEventSeen) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [provider]);

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const response = await runMutationLifecycle({
        mutate: () => provider.signUp(input),
      });
      if (response.session) setSession(response.session);
      return response;
    },
    [provider],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await runMutationLifecycle({
        mutate: () => provider.login(email, password),
      });
      if (response.session) setSession(response.session);
      return response;
    },
    [provider],
  );

  const logout = useCallback(async () => {
    await runMutationLifecycle({ mutate: () => provider.logout() });
    setSession(null);
  }, [provider]);

  const requestPasswordReset = useCallback(
    (email: string) => runMutationLifecycle({
      mutate: () => provider.requestPasswordReset(
        email,
        `${window.location.origin}/reset?mode=update`,
      ),
    }),
    [provider],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      const response = await runMutationLifecycle({
        mutate: () => provider.updatePassword(password),
      });
      if (response.ok) setRecoveryMode(false);
      return response;
    },
    [provider],
  );

  const value = useMemo(
    () => ({
      session,
      loading,
      recoveryMode,
      signUp,
      login,
      logout,
      requestPasswordReset,
      updatePassword,
    }),
    [
      loading,
      login,
      logout,
      recoveryMode,
      requestPasswordReset,
      session,
      signUp,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthSessionProvider.');
  return value;
}
