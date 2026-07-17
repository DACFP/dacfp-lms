import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  KeyRound,
  Mail,
  UserPlus,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh bg-dacfp-wash lg:grid-cols-[minmax(20rem,0.9fr)_minmax(28rem,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand-navy to-brand-navy-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-royal via-brand-royal-bright to-brand-gold" />
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-xl border border-white/20 bg-white/10">
            <BookOpen size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xl font-bold">DACFP</p>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/65">
              Learning portal
            </p>
          </div>
        </div>
        <div className="max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">
            Dark-build preview
          </p>
          <p className="mt-4 text-4xl font-bold leading-tight">
            Professional learning, with progress you can trust.
          </p>
          <p className="mt-5 max-w-md leading-7 text-white/70">
            Sandbox authentication protects synthetic learner content, progress, and quiz attempts end to end.
          </p>
        </div>
        <p className="text-sm text-white/55">
          Learning access and designation status are managed separately.
        </p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-lg">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-xl bg-brand-navy text-white">
              <BookOpen size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold text-brand-navy">DACFP</p>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-dacfp-slate">
                Learning portal
              </p>
            </div>
          </div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 leading-7 text-dacfp-slate">{description}</p>
          <div className="card mt-8 p-6 sm:p-8">{children}</div>
        </div>
      </section>
    </main>
  );
}

export function LoginPage() {
  const { login, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [successful, setSuccessful] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const response =
      mode === 'login'
        ? await login(email, password)
        : await signUp({ email, password, displayName });
    setSubmitting(false);
    setSuccessful(response.ok);
    setMessage(response.message);

    if (response.ok && response.session) {
      const requested = (location.state as { from?: string } | null)?.from;
      const defaultDestination = response.session.user.role === 'operator' ? '/admin' : '/dashboard';
      const destination =
        requested?.startsWith('/admin') && response.session.user.role !== 'operator'
          ? '/dashboard'
          : requested?.startsWith('/')
            ? requested
            : defaultDestination;
      navigate(destination, {
        replace: true,
      });
    }
  };

  const changeMode = (nextMode: 'login' | 'signup') => {
    setMode(nextMode);
    setMessage('');
    setSuccessful(false);
  };

  return (
    <AuthShell
      eyebrow="Learner access"
      title={mode === 'login' ? 'Sign in to continue' : 'Create your learner account'}
      description="Sandbox authentication protects learner access. Sign-in failures use one generic response to prevent account enumeration."
    >
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-dacfp-wash p-1" role="tablist" aria-label="Authentication mode">
        <button
          className={`min-h-11 rounded-md px-3 text-sm font-bold ${mode === 'login' ? 'bg-white text-brand-navy shadow-sm' : 'text-dacfp-slate'}`}
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => changeMode('login')}
        >
          Sign in
        </button>
        <button
          className={`min-h-11 rounded-md px-3 text-sm font-bold ${mode === 'signup' ? 'bg-white text-brand-navy shadow-sm' : 'text-dacfp-slate'}`}
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => changeMode('signup')}
        >
          Create account
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        {mode === 'signup' ? (
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-brand-navy">Full name</span>
            <input
              className="field"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-brand-navy">Email</span>
          <input
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.test"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-brand-navy">Password</span>
          <input
            className="field"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
            aria-describedby={mode === 'signup' ? 'password-help' : undefined}
          />
          {mode === 'signup' ? (
            <span id="password-help" className="mt-2 block text-xs leading-5 text-dacfp-slate">
              Use at least 8 characters and avoid a password exposed in another service.
            </span>
          ) : null}
        </label>
        {message ? (
          <p
            className={`rounded-lg border p-3 text-sm leading-6 ${successful ? 'border-status-positive/25 bg-status-positive/10 text-status-positive' : 'border-status-danger/25 bg-status-danger/10 text-status-danger'}`}
            role={successful ? 'status' : 'alert'}
          >
            {message}
          </p>
        ) : null}
        <button className="button-primary w-full" type="submit" disabled={submitting}>
          {mode === 'signup' ? <UserPlus size={17} aria-hidden="true" /> : null}
          {submitting
            ? mode === 'login'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
          {!submitting ? <ArrowRight size={17} aria-hidden="true" /> : null}
        </button>
      </form>
      <div className="mt-5 border-t border-dacfp-line pt-5 text-center text-sm">
        <Link className="font-bold text-brand-royal hover:underline" to="/reset">
          Forgot your password?
        </Link>
      </div>
    </AuthShell>
  );
}

export function ResetPage() {
  const { recoveryMode, requestPasswordReset, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [successful, setSuccessful] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const response = await requestPasswordReset(email);
    setSubmitting(false);
    setSuccessful(response.ok);
    setMessage(response.message);
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setSuccessful(false);
      setMessage('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const response = await updatePassword(password);
    setSubmitting(false);
    setSuccessful(response.ok);
    setMessage(response.message);
  };

  return (
    <AuthShell
      eyebrow="Password recovery"
      title={recoveryMode ? 'Set a new password' : 'Reset your password'}
      description={
        recoveryMode
          ? 'Choose a new password for your authenticated recovery session.'
          : 'Enter your email. The same confirmation appears whether or not an account exists.'
      }
    >
      {recoveryMode ? (
        <form onSubmit={(event) => void submitPassword(event)} className="space-y-5">
          <div className="grid size-11 place-items-center rounded-xl bg-dacfp-wash-blue text-brand-royal">
            <KeyRound size={22} aria-hidden="true" />
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-brand-navy">New password</span>
            <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-brand-navy">Confirm new password</span>
            <input className="field" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {message ? <AuthMessage successful={successful} message={message} /> : null}
          <button className="button-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Updating password…' : 'Update password'}
            {!submitting ? <ArrowRight size={17} aria-hidden="true" /> : null}
          </button>
          {successful ? <Link className="button-secondary w-full" to="/dashboard">Continue to dashboard</Link> : null}
        </form>
      ) : successful ? (
        <div role="status" className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-status-positive/10 text-status-positive">
            <Mail size={23} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-brand-navy">Check your email</h2>
          <p className="mt-2 text-sm leading-6 text-dacfp-slate">{message}</p>
          <Link className="button-secondary mt-6" to="/login">Return to sign in</Link>
        </div>
      ) : (
        <form onSubmit={(event) => void submitReset(event)} className="space-y-5">
          <div className="grid size-11 place-items-center rounded-xl bg-dacfp-wash-blue text-brand-royal">
            <KeyRound size={22} aria-hidden="true" />
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-brand-navy">Email</span>
            <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.test" />
          </label>
          <button className="button-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset instructions'}
            {!submitting ? <ArrowRight size={17} aria-hidden="true" /> : null}
          </button>
          {message ? <AuthMessage successful={successful} message={message} /> : null}
          <Link className="button-quiet w-full" to="/login">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

function AuthMessage({ successful, message }: { successful: boolean; message: string }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm leading-6 ${successful ? 'border-status-positive/25 bg-status-positive/10 text-status-positive' : 'border-status-danger/25 bg-status-danger/10 text-status-danger'}`}
      role={successful ? 'status' : 'alert'}
    >
      {successful ? <CheckCircle2 className="mt-0.5 shrink-0" size={17} aria-hidden="true" /> : null}
      <span>{message}</span>
    </p>
  );
}
