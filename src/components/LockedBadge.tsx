import { useId } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * The single locked-state badge (brief #14, #19). Replaces five drifted
 * "Locked" treatments (bare StatusPill, inline lock glyph + text, plain text).
 *
 * The lock *reason* is the storytelling half of brief #14: the badge alone says
 * a thing is locked, the reason says why. It is exposed via aria-describedby so
 * assistive tech gets the same explanation sighted users get from surrounding
 * copy, without duplicating that copy visually.
 */
export function LockedBadge({
  reason,
  className,
  children = 'Locked',
}: {
  reason?: string;
  className?: string;
  children?: string;
}) {
  const reactId = useId();
  const reasonId = reason ? `${reactId}-lock-reason` : undefined;

  return (
    <>
      <Badge
        variant="outline"
        aria-describedby={reasonId}
        className={cn(
          'h-7 gap-1.5 rounded-md border-dacfp-line bg-dacfp-wash px-2.5 text-xs font-bold text-dacfp-gray-text',
          className,
        )}
      >
        <LockKeyhole aria-hidden="true" />
        {children}
      </Badge>
      {reason ? (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      ) : null}
    </>
  );
}
