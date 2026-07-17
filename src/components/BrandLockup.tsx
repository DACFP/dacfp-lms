import { cn } from '@/lib/utils';

/**
 * The DACFP lockup (cube + wordmark + descriptor).
 *
 * Brand/TOKENS.md logo law: the black-text lockup is for light surfaces, the
 * white-text lockup for navy/dark ones. Which file ships is decided here and
 * nowhere else, so a call site cannot put black text on a navy ground.
 *
 * Both files are the untouched 451x225 originals, recompressed only. Displayed
 * at 32-52px tall, that is 4x+ device-pixel headroom, so no @2x set is needed.
 */
export function BrandLockup({
  surface,
  className,
  priority = false,
}: {
  surface: 'light' | 'navy';
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={surface === 'navy' ? '/brand/dacfp-lockup-dark.png' : '/brand/dacfp-lockup-light.png'}
      // The lockup carries the organisation name as artwork, so it is the
      // accessible name here rather than decoration. Call sites that already
      // name the region pass alt="" via aria-hidden on a wrapper instead.
      alt="DACFP — Digital Assets Council of Financial Professionals"
      width={451}
      height={225}
      loading={priority ? 'eager' : 'lazy'}
      // fetchpriority is a valid HTML attribute; React 19 passes it through.
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={cn('h-10 w-auto', className)}
    />
  );
}
