import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';

export interface MutationNotice {
  kind: 'success' | 'warning' | 'error';
  message: string;
  retry?: () => void;
}

export function MutationStatusBanner({
  notice,
  onDismiss,
}: {
  notice: MutationNotice | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  const warning = notice.kind === 'warning';
  const error = notice.kind === 'error';
  const Icon = error || warning ? AlertTriangle : CheckCircle2;

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex justify-center sm:inset-x-6">
      <div
        className={`pointer-events-auto flex w-full max-w-3xl items-start gap-3 rounded-xl border bg-white p-4 shadow-lg ${
          error
            ? 'border-status-danger/35'
            : warning
              ? 'border-dacfp-gold/50'
              : 'border-status-positive/35'
        }`}
        role={error ? 'alert' : 'status'}
      >
        <Icon
          aria-hidden="true"
          className={`size-icon-md ${error ? 'text-status-danger' : warning ? 'text-dacfp-gold-text' : 'text-status-positive'}`}
        />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-dacfp-navy">
          {notice.message}
        </p>
        {notice.retry ? (
          <button className="button-quiet min-h-9 px-2" onClick={notice.retry} type="button">
            <RefreshCw className="size-icon-sm" aria-hidden="true" /> Retry
          </button>
        ) : null}
        <button
          aria-label="Dismiss status"
          className="button-quiet min-h-9 px-2"
          onClick={onDismiss}
          type="button"
        >
          <X className="size-icon-sm" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
