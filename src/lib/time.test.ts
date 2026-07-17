import { describe, expect, it } from 'vitest';
import { formatClock, formatClockLabel } from './time';

describe('formatClock — brief #7 (one shared mm:ss formatter)', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [60, '1:00'],
    [95, '1:35'],
    [599, '9:59'],
    [872, '14:32'],
    [3599, '59:59'],
  ])('formats %ss as %s', (input, expected) => {
    expect(formatClock(input)).toBe(expected);
  });

  it('rolls over to h:mm:ss past an hour, zero-padding minutes', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(7325)).toBe('2:02:05');
  });

  it('floors rather than rounds, so a duration never prints longer than the media', () => {
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(0.4)).toBe('0:00');
  });

  it.each([
    [null, '0:00'],
    [undefined, '0:00'],
    [Number.NaN, '0:00'],
    [-30, '0:00'],
  ])('degrades safely for %s', (input, expected) => {
    expect(formatClock(input as number | null | undefined)).toBe(expected);
  });
});

describe('formatClockLabel — spoken duration', () => {
  it.each([
    [0, '0 seconds'],
    [1, '1 second'],
    [60, '1 minute'],
    [95, '1 minute 35 seconds'],
    [872, '14 minutes 32 seconds'],
    [3600, '1 hour'],
    [3661, '1 hour 1 minute 1 second'],
  ])('speaks %ss as "%s"', (input, expected) => {
    expect(formatClockLabel(input)).toBe(expected);
  });

  it('degrades safely', () => {
    expect(formatClockLabel(null)).toBe('0 seconds');
    expect(formatClockLabel(Number.NaN)).toBe('0 seconds');
  });
});
