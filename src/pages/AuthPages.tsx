import {
  ArrowRight,
  BookOpen,
  KeyRound,
  Mail,
  UserPlus,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Alert } from '../components/Alert';
import { DarkBuildOnly, darkBuildCopy } from '../components/DarkBuild';
import { BrandLockup } from '../components/BrandLockup';
import { Field } from '../components/Field';
import { IconTile } from '../components/IconTile';
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
    <main className="learner-skin grid min-h-dvh bg-dacfp-wash lg:grid-cols-[minmax(20rem,0.9fr)_minmax(28rem,1.1fr)]">
      <section className="on-navy relative hidden overflow-hidden bg-dacfp-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="brand-strip absolute inset-x-0 top-0 h-1.5" />
        <BrandLockup surface="navy" priority className="h-14 w-auto" />
        <div className="max-w-form">
          <DarkBuildOnly>
            {/* gold-hi, not raw gold: this is text on a navy ground (8.30:1). */}
            <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gold-hi">
              Dark-build preview
            </p>
          </DarkBuildOnly>
          <p className="mt-4 text-4xl font-bold leading-tight">
            Your course of study, your record, one place.
          </p>
          <p className="mt-5 max-w-md leading-7 text-white/70">
            {darkBuildCopy(
              'Sandbox authentication protects synthetic learner content, progress, and checkpoint attempts end to end.',
              'Authentication protects your learner content, progress, and checkpoint attempts end to end.',
            )}
          </p>
        </div>
        <p className="text-sm text-white/70">
          Learning access and designation status are managed separately.
        </p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-form">
          <div className="mb-8 lg:hidden">
            <BrandLockup surface="light" priority className="h-11 w-auto" />
          </div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-dacfp-navy sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 leading-7 text-dacfp-gray-text">{description}</p>
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
      description={darkBuildCopy(
        'Sandbox authentication protects learner access. Sign-in failures use one generic response to prevent account enumeration.',
        'Sign-in failures use one generic response to prevent account enumeration.',
      )}
    >
      {/*
        brief #12. This was role="tablist" + role="tab" + aria-selected with no
        tabpanel, no aria-controls and no roving tabindex — a tab pattern that
        announced itself as tabs and then behaved like nothing. Both modes drive
        one shared <form>, so real tabpanels would mean duplicating that form;
        these are the brief's other sanctioned option, plain buttons, which can
        describe themselves honestly via aria-pressed.
      */}
      <div className="mb-6 grid grid-cols-2 rounded-[0.1875rem] bg-dacfp-wash p-1" role="group" aria-label="Authentication mode">
        <button
          className={`min-h-11 rounded-[0.1875rem] px-3 text-sm font-bold ${mode === 'login' ? 'bg-white text-dacfp-navy shadow-sm' : 'text-dacfp-gray-text'}`}
          type="button"
          aria-pressed={mode === 'login'}
          onClick={() => changeMode('login')}
        >
          Sign in
        </button>
        <button
          className={`min-h-11 rounded-[0.1875rem] px-3 text-sm font-bold ${mode === 'signup' ? 'bg-white text-dacfp-navy shadow-sm' : 'text-dacfp-gray-text'}`}
          type="button"
          aria-pressed={mode === 'signup'}
          onClick={() => changeMode('signup')}
        >
          Create account
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        {mode === 'signup' ? (
          <Field label="Full name">
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              required
            />
          </Field>
        ) : null}
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.test"
          />
        </Field>
        <Field
          label="Password"
          hint={
            mode === 'signup'
              ? 'Use at least 8 characters and avoid a password exposed in another service.'
              : undefined
          }
        >
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
        </Field>
        {message ? <AuthMessage successful={successful} message={message} /> : null}
        <button className="button-primary w-full" type="submit" disabled={submitting}>
          {mode === 'signup' ? <UserPlus className="size-icon-sm" aria-hidden="true" /> : null}
          {submitting
            ? mode === 'login'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
          {!submitting ? <ArrowRight className="size-icon-sm" aria-hidden="true" /> : null}
        </button>
      </form>
      <div className="mt-5 border-t border-dacfp-line pt-5 text-center text-sm">
        <Link className="font-bold text-dacfp-blue hover:underline" to="/reset">
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
          <IconTile icon={KeyRound} size="md" tone="brand" />
          <Field label="New password">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          {message ? <AuthMessage successful={successful} message={message} /> : null}
          <button className="button-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Updating password…' : 'Update password'}
            {!submitting ? <ArrowRight className="size-icon-sm" aria-hidden="true" /> : null}
          </button>
          {successful ? <Link className="button-secondary w-full" to="/dashboard">Continue to dashboard</Link> : null}
        </form>
      ) : successful ? (
        <div role="status" className="text-center">
          <IconTile icon={Mail} size="lg" tone="positive" className="mx-auto" />
          <h2 className="mt-4 text-lg font-bold text-dacfp-navy">Check your email</h2>
          <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">{message}</p>
          <Link className="button-secondary mt-6" to="/login">Return to sign in</Link>
        </div>
      ) : (
        <form onSubmit={(event) => void submitReset(event)} className="space-y-5">
          <IconTile icon={KeyRound} size="md" tone="brand" />
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.test" />
          </Field>
          <button className="button-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset instructions'}
            {!submitting ? <ArrowRight className="size-icon-sm" aria-hidden="true" /> : null}
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
    <Alert tone={successful ? 'positive' : 'danger'}>
      {message}
    </Alert>
  );
}
