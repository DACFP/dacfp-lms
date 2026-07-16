import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { AuthSessionProvider } from './context/AuthContext';
import { LmsProvider } from './context/LmsContext';
import { mockProvider } from './data/mockProvider';
import type { LmsAuthProvider, LmsAuthSession } from './data/provider';

const signedInSession: LmsAuthSession = {
  user: {
    id: 'auth-fully-complete',
    email: 'complete@example.test',
    displayName: 'Fully complete',
    role: 'learner',
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
) {
  const separator = path.includes('?') ? '&' : '?';
  const route = `${path}${separator}learner=${learner}`;
  window.history.replaceState({}, '', route);
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthSessionProvider provider={authProvider}>
        <LmsProvider provider={mockProvider}>
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

  it('shows the blocking terms modal to the fresh learner', async () => {
    renderRoute('/dashboard', 'fresh');
    expect(await screen.findByRole('dialog', { name: 'Accept the program terms to continue' })).toBeInTheDocument();
  });

  it('renders lesson resources and all optional account credential fields', async () => {
    renderRoute('/lesson/fpt-m1-reading');
    expect(await screen.findByRole('heading', { name: 'Lesson resources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bitcoin foundations workbook/ })).toBeInTheDocument();
  });

  it('renders the three credential ID fields on the account route', async () => {
    renderRoute('/account');
    expect(await screen.findByLabelText('CFP ID')).toBeInTheDocument();
    expect(screen.getByLabelText('IWI ID')).toBeInTheDocument();
    expect(screen.getByLabelText('CFA ID')).toBeInTheDocument();
  });

  it('redirects an unauthenticated protected route to login', async () => {
    renderRoute('/dashboard', 'fully-complete', testAuthProvider(null));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to continue' })).toBeInTheDocument();
  });
});
