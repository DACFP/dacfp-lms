import type { ProgressionMode } from '../data/types';

export function clampSeekTarget(
  requestedSeconds: number,
  maxWatchedSeconds: number,
  progression: ProgressionMode,
  reviewMode = false,
) {
  const requested = Math.max(0, requestedSeconds);
  if (progression === 'open' || reviewMode) return requested;
  return Math.min(requested, Math.max(0, maxWatchedSeconds));
}

export function allowedPlaybackRate(
  requestedRate: number,
  progression: ProgressionMode,
  reviewMode = false,
) {
  if (progression === 'sequential' && !reviewMode) return 1;
  return Math.min(2, Math.max(0.5, requestedRate));
}
