import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-dacfp-line pb-7 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-dacfp-navy md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-dacfp-gray-text">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-dacfp-navy">{label}</span>
        <span className="tabular-nums text-dacfp-gray-text">{value}%</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-dacfp-wash-blue"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div
          className="h-full rounded-full bg-dacfp-blue transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: 'positive' | 'warning' | 'neutral'; children: ReactNode }) {
  const className = {
    positive: 'border-status-positive/25 bg-status-positive/10 text-status-positive',
    warning: 'border-dacfp-gold/40 bg-dacfp-gold/10 text-dacfp-navy',
    neutral: 'border-dacfp-line bg-dacfp-wash-blue text-dacfp-blue',
  }[tone];

  return (
    <span className={`inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card px-6 py-12 text-center">
      <h2 className="text-lg font-bold text-dacfp-navy">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-dacfp-gray-text">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function formatDate(value: string | null) {
  if (!value) return 'No expiry set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
