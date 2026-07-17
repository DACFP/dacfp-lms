import type { ComponentProps, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  Alert as AlertBase,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export type AlertTone = 'danger' | 'warning' | 'positive' | 'info';

/**
 * The single app alert (brief #19). Replaces eight hand-rolled `role="alert"`
 * blocks that had drifted between bare red text and three different boxed
 * treatments.
 *
 * Tones map to Brand/TOKENS.md. `danger` resolves to the maroon family, not an
 * off-brand red; `warning` uses gold-text (6.25:1) rather than raw gold, which
 * the allowed-background law forbids as text on light.
 */
const toneStyles: Record<AlertTone, string> = {
  danger: 'border-status-danger/30 bg-status-danger/5 text-status-danger',
  warning: 'border-dacfp-gold/50 bg-dacfp-gold/10 text-dacfp-gold-text',
  positive: 'border-status-positive/30 bg-status-positive/5 text-status-positive',
  info: 'border-dacfp-line bg-dacfp-wash-blue text-dacfp-blue',
};

const toneIcon: Record<AlertTone, typeof AlertTriangle> = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  positive: CheckCircle2,
  info: Info,
};

/**
 * danger/warning interrupt (assertive); positive/info do not. Callers can still
 * override via `role`, which spreads last.
 */
const toneRole: Record<AlertTone, 'alert' | 'status'> = {
  danger: 'alert',
  warning: 'alert',
  positive: 'status',
  info: 'status',
};

export function Alert({
  tone = 'danger',
  title,
  icon,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof AlertBase>, 'variant' | 'title'> & {
  tone?: AlertTone;
  title?: ReactNode;
  icon?: ReactNode;
}) {
  const ToneIcon = toneIcon[tone];

  return (
    <AlertBase
      role={toneRole[tone]}
      className={cn('items-start gap-x-2.5 px-3.5 py-3', toneStyles[tone], className)}
      {...props}
    >
      {icon ?? <ToneIcon className="size-icon-md" aria-hidden="true" />}
      {title ? <AlertTitle className="font-bold">{title}</AlertTitle> : null}
      <AlertDescription className="text-current/90">{children}</AlertDescription>
    </AlertBase>
  );
}
