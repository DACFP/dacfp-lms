import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

export type IconTileSize = 'sm' | 'md' | 'lg';
export type IconTileTone = 'brand' | 'gold' | 'positive' | 'on-navy';

/**
 * The single icon-tile component (brief #19). Replaces 16 hand-rolled
 * `grid size-N place-items-center rounded-xl` blocks that had drifted across
 * three tile sizes and four tone treatments.
 *
 * Tile glyph sizes come from the tokenized icon scale (brief #20) rather than
 * per-call-site pixel values.
 */
const tileSize: Record<IconTileSize, string> = {
  sm: 'size-10',
  md: 'size-11',
  lg: 'size-12',
};

const glyphSize: Record<IconTileSize, string> = {
  sm: 'size-icon-sm',
  md: 'size-icon-md',
  lg: 'size-icon-lg',
};

/**
 * Allowed backgrounds per Brand/TOKENS.md. Gold carries navy at 3.80:1 —
 * legal here because a tile glyph is a non-text UI element (3.0 bar), never
 * body text.
 */
const tileTone: Record<IconTileTone, string> = {
  brand: 'bg-dacfp-wash-blue text-dacfp-blue',
  gold: 'bg-dacfp-gold/15 text-dacfp-navy',
  positive: 'bg-status-positive/10 text-status-positive',
  'on-navy': 'border border-white/20 bg-white/10 text-white',
};

export function IconTile({
  icon: Icon,
  size = 'md',
  tone = 'brand',
  className,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  size?: IconTileSize;
  tone?: IconTileTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-xl',
        tileSize[size],
        tileTone[tone],
        className,
      )}
    >
      <Icon className={glyphSize[size]} aria-hidden={true} />
    </div>
  );
}
