import { describe, expect, it } from 'vitest';
import { allowedPlaybackRate, clampSeekTarget } from './player';

describe('compliance player policy', () => {
  it('allows backward seeking in sequential courses', () => {
    expect(clampSeekTarget(12, 30, 'sequential')).toBe(12);
  });

  it('clamps forward seeking to the furthest watched point', () => {
    expect(clampSeekTarget(90, 30, 'sequential')).toBe(30);
  });

  it('allows open-course seeking and speed controls', () => {
    expect(clampSeekTarget(90, 30, 'open')).toBe(90);
    expect(allowedPlaybackRate(1.75, 'open')).toBe(1.75);
  });

  it('forces sequential-course playback to 1x', () => {
    expect(allowedPlaybackRate(2, 'sequential')).toBe(1);
  });
});
