import { ArrowRight, BookOpen, KeyRound, Mail } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
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
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/65">Learning portal</p>
          </div>
        </div>
        <div className="max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Dark-build preview</p>
          <p className="mt-4 text-4xl font-bold leading-tight">Professional learning, with progress you can trust.</p>
          <p className="mt-5 max-w-md leading-7 text-white/70">Synthetic data only. The D0 shell exercises the real catalog shape without contacting an external service.</p>
        </div>
        <p className="text-sm text-white/55">Learning access and designation status are managed separately.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-lg">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-xl bg-brand-navy text-white"><BookOpen size={22} aria-hidden="true" /></div>
            <div><p className="font-bold text-brand-navy">DACFP</p><p className="text-xs font-bold uppercase tracking-[0.14em] text-dacfp-slate">Learning portal</p></div>
          </div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">{title}</h1>
          <p className="mt-3 leading-7 text-dacfp-slate">{description}</p>
          <div className="card mt-8 p-6 sm:p-8">{children}</div>
        </div>
      </section>
    </main>
  );
}

export function LoginPage() {
  const [message, setMessage] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage('D0 uses synthetic learner states. Authentication begins in D1.');
  };

  return (
    <AuthShell eyebrow="Learner access" title="Sign in to continue" description="Use your learning-portal email and password. Authentication errors remain generic to protect account privacy.">
      <form onSubmit={submit} className="space-y-5">
        <label className="block"><span className="mb-2 block text-sm font-bold text-brand-navy">Email</span><input className="field" type="email" autoComplete="email" required placeholder="you@example.test" /></label>
        <label className="block"><span className="mb-2 block text-sm font-bold text-brand-navy">Password</span><input className="field" type="password" autoComplete="current-password" required /></label>
        {message ? <p className="rounded-lg border border-dacfp-line bg-dacfp-wash p-3 text-sm leading-6 text-dacfp-slate" role="status">{message}</p> : null}
        <button className="button-primary w-full" type="submit">Sign in <ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      <div className="mt-5 flex flex-col gap-3 border-t border-dacfp-line pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Link className="font-bold text-brand-royal hover:underline" to="/reset">Forgot your password?</Link>
        <Link className="font-bold text-brand-royal hover:underline" to="/dashboard?learner=mid-module-2">Enter mock portal</Link>
      </div>
    </AuthShell>
  );
}

export function ResetPage() {
  const [sent, setSent] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSent(true);
  };

  return (
    <AuthShell eyebrow="Password recovery" title="Reset your password" description="Enter your email. The live flow will use an email OTP and always return a generic confirmation.">
      {sent ? (
        <div role="status" className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-status-positive/10 text-status-positive"><Mail size={23} aria-hidden="true" /></div>
          <h2 className="mt-4 text-lg font-bold text-brand-navy">Check your email</h2>
          <p className="mt-2 text-sm leading-6 text-dacfp-slate">If an account exists, reset instructions will be sent. D0 does not send an email.</p>
          <Link className="button-secondary mt-6" to="/login">Return to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid size-11 place-items-center rounded-xl bg-dacfp-wash-blue text-brand-royal"><KeyRound size={22} aria-hidden="true" /></div>
          <label className="block"><span className="mb-2 block text-sm font-bold text-brand-navy">Email</span><input className="field" type="email" autoComplete="email" required placeholder="you@example.test" /></label>
          <button className="button-primary w-full" type="submit">Send reset instructions <ArrowRight size={17} aria-hidden="true" /></button>
          <Link className="button-quiet w-full" to="/login">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}
