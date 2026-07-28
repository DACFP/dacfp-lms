import { describe, expect, it } from 'vitest';
import type { LmsModule } from '../data/types';
import { moduleCounterLabel } from './moduleLabel';

const modules = Array.from({ length: 5 }, (_, position): LmsModule => ({
  id: `module-${position}`,
  course_id: 'course-fpt',
  position,
  title: position === 0 ? 'Introduction' : `Module ${position}`,
  ce_credits: null,
  bridge_copy: null,
}));

describe('moduleCounterLabel', () => {
  it('counts Introduction in the denominator without zero-padding numbered modules', () => {
    expect(moduleCounterLabel(modules[0], modules)).toBe('Introduction');
    expect(moduleCounterLabel(modules[4], modules)).toBe('Module 4 of 5');
  });
});
