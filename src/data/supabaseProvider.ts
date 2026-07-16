import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type {
  LmsAuthEvent,
  LmsAuthProvider,
  LmsAuthResult,
  LmsAuthSession,
  LmsAuthRole,
} from './provider';

export const GENERIC_LOGIN_ERROR =
  'Unable to sign in. Check your credentials and try again.';
export const GENERIC_RESET_RESPONSE =
  'If an account exists, reset instructions will be sent.';
export const GENERIC_SIGNUP_ERROR =
  'Unable to create the account. Check your details and try again.';
export const GENERIC_PASSWORD_ERROR =
  'Unable to update the password. Request a new reset link and try again.';

let client: SupabaseClient | null = null;

function getClient() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error('Sandbox authentication is not configured.');
  }

  client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

function toRole(value: unknown): LmsAuthRole {
  return value === 'learner' || value === 'operator' ? value : null;
}

function toSession(session: Session | null): LmsAuthSession | null {
  if (!session) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      displayName:
        typeof session.user.user_metadata.display_name === 'string'
          ? session.user.user_metadata.display_name
          : '',
      role: toRole(session.user.app_metadata.role),
    },
  };
}

function result(
  ok: boolean,
  message: string,
  session: Session | null = null,
): LmsAuthResult {
  return { ok, message, session: toSession(session) };
}

export const supabaseProvider: LmsAuthProvider = {
  async getSession() {
    try {
      const { data, error } = await getClient().auth.getSession();
      if (error) return null;
      return toSession(data.session);
    } catch {
      return null;
    }
  },

  onAuthStateChange(callback) {
    const {
      data: { subscription },
    } = getClient().auth.onAuthStateChange((event, session) => {
      callback(event as LmsAuthEvent, toSession(session));
    });
    return () => subscription.unsubscribe();
  },

  async signUp({ email, password, displayName }) {
    try {
      const { data, error } = await getClient().auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) return result(false, GENERIC_SIGNUP_ERROR);
      return result(
        true,
        data.session
          ? 'Account created. You are signed in.'
          : 'Account created. Check your email to confirm access.',
        data.session,
      );
    } catch {
      return result(false, GENERIC_SIGNUP_ERROR);
    }
  },

  async login(email, password) {
    try {
      const { data, error } = await getClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.session) return result(false, GENERIC_LOGIN_ERROR);
      return result(true, 'Signed in.', data.session);
    } catch {
      return result(false, GENERIC_LOGIN_ERROR);
    }
  },

  async logout() {
    try {
      await getClient().auth.signOut({ scope: 'local' });
    } catch {
      // Local session state is cleared by AuthSessionProvider regardless.
    }
  },

  async requestPasswordReset(email, redirectTo) {
    try {
      await getClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });
    } catch {
      // Deliberately indistinguishable from a successful reset request.
    }
    return result(true, GENERIC_RESET_RESPONSE);
  },

  async updatePassword(password) {
    try {
      const { error } = await getClient().auth.updateUser({ password });
      if (error) return result(false, GENERIC_PASSWORD_ERROR);
      const { data: sessionData } = await getClient().auth.getSession();
      return result(true, 'Password updated.', sessionData.session);
    } catch {
      return result(false, GENERIC_PASSWORD_ERROR);
    }
  },
};
