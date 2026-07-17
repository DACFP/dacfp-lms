import { cn } from '@/lib/utils';

export type CbdaSealSize = 'sm' | 'md' | 'lg';

/**
 * The CBDA seal (Brand/SEAL_NEW.png).
 *
 * Brand/TOKENS.md law: never recolored, minimum display ~48px. There is
 * deliberately no tone/variant prop and no filter, opacity or blend utility
 * reaches the image — 'sm' is the 48px floor, not a smaller decorative option.
 *
 * MEANING GUARD: the artwork reads "CERTIFIED IN BLOCKCHAIN AND DIGITAL
 * ASSETS". This product's load-bearing copy keeps learning access and
 * designation standing separate, so the seal must never read as a claim that
 * the learner holds the designation. It is a *programme* mark: it says what a
 * track leads to. The accessible name says "seal" and never "your"; call sites
 * are responsible for surrounding copy that frames it the same way.
 */
const sealSize: Record<CbdaSealSize, string> = {
  sm: 'size-12', // 48px — the TOKENS.md floor
  md: 'size-16', // 64px
  lg: 'size-20', // 80px
};

export function CbdaSeal({
  size = 'md',
  className,
  decorative = false,
}: {
  size?: CbdaSealSize;
  className?: string;
  /** Set when adjacent copy already names the credential. */
  decorative?: boolean;
}) {
  return (
    <img
      src="/brand/cbda-seal.png"
      alt={decorative ? '' : 'CBDA — Certified in Blockchain and Digital Assets seal'}
      aria-hidden={decorative || undefined}
      width={224}
      height={228}
      loading="lazy"
      decoding="async"
      className={cn('shrink-0 object-contain', sealSize[size], className)}
    />
  );
}
