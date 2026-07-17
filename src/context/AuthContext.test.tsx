import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  LmsAuthEvent,
  LmsAuthProvider,
  LmsAuthSession,
} from '../data/provider';
import { AuthSessionProvider, useAuth } from './AuthContext';

const eventSession: LmsAuthSession = {
  user: {
    id: 'event-user',
    email: 'event@example.test',
    displayName: 'Event user',
    role: 'learner',
  },
};

function SessionProbe() {
  const { loading, session } = useAuth();
  return <p>{loading ? 'loading' : session?.user.email ?? 'signed out'}</p>;
}

describe('AuthSessionProvider', () => {
  it('does not let a stale getSession result overwrite a newer auth event', async () => {
    let resolveSession: ((session: LmsAuthSession | null) => void) | undefined;
    let emit: ((event: LmsAuthEvent, session: LmsAuthSession | null) => void) | undefined;
    const provider: LmsAuthProvider = {
      getSession: () => new Promise((resolve) => { resolveSession = resolve; }),
      onAuthStateChange(callback) {
        emit = callback;
        return () => undefined;
      },
      async signUp() { return { ok: false, message: '', session: null }; },
      async login() { return { ok: false, message: '', session: null }; },
      async logout() {},
      async requestPasswordReset() { return { ok: true, message: '', session: null }; },
      async updatePassword() { return { ok: false, message: '', session: null }; },
    };

    render(
      <AuthSessionProvider provider={provider}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();

    act(() => emit?.('SIGNED_IN', eventSession));
    expect(screen.getByText('event@example.test')).toBeInTheDocument();

    await act(async () => resolveSession?.(null));
    expect(screen.getByText('event@example.test')).toBeInTheDocument();
  });
});
