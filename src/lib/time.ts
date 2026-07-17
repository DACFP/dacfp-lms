/**
 * The one clock formatter (brief #7).
 *
 * Before this, the player rendered a resume point as raw seconds ("847s") and
 * the module list rounded the same underlying value to whole minutes ("14
 * min") — two vocabularies for one quantity, neither of them mm:ss.
 *
 * Every duration and position in the learner app goes through here.
 */
export function formatClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '0:00';

  // Floor, not round: a position 0.9s into a second has not reached the next
  // one, and rounding up can print a duration one second longer than the media.
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Spoken form for screen readers and aria-labels, where "14:32" is read as a
 * time of day rather than a duration.
 */
export function formatClockLabel(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '0 seconds';

  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  }
  return parts.join(' ');
}
