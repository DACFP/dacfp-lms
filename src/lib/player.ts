import type { ProgressionMode } from '../data/types';

export function clampSeekTarget(
  requestedSeconds: number,
  maxWatchedSeconds: number,
  progression: ProgressionMode,
) {
  const requested = Math.max(0, requestedSeconds);
  if (progression === 'open') return requested;
  return Math.min(requested, Math.max(0, maxWatchedSeconds));
}

export function allowedPlaybackRate(
  requestedRate: number,
  progression: ProgressionMode,
) {
  return progression === 'sequential' ? 1 : requestedRate;
}
