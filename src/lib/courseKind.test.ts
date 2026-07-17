import { describe, expect, it } from 'vitest';
import { mockCatalog } from '../data/mockProvider';
import type { LmsCourse } from '../data/types';
import { courseKind } from './courseKind';

function course(overrides: Partial<LmsCourse>): LmsCourse {
  return {
    id: 'c',
    slug: 'some-course',
    title: 'Some course',
    description: '',
    status: 'published',
    progression: 'sequential',
    prerequisite_course_id: null,
    ce_credits: null,
    requires_terms_acceptance: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('courseKind — dashboard IA grouping', () => {
  it('classifies the real sandbox catalog the way the IA expects', () => {
    const kinds = Object.fromEntries(
      mockCatalog.courses.map((item) => [item.slug, courseKind(item)]),
    );
    expect(kinds).toEqual({
      'fpt-sandbox': 'flagship',
      'bonus-sandbox': 'library',
      'renewal-2026-sandbox': 'renewal',
    });
  });

  it('treats any prerequisite-gated course as library, renewal slug or not', () => {
    expect(courseKind(course({ prerequisite_course_id: 'course-fpt' }))).toBe('library');
    // Prerequisite wins: a gated course belongs in the library even if it is
    // named like a renewal, because it is not a standalone annual event.
    expect(
      courseKind(course({ slug: 'renewal-2027', prerequisite_course_id: 'course-fpt' })),
    ).toBe('library');
  });

  it('matches the renewal slug on a word boundary, not a substring', () => {
    expect(courseKind(course({ slug: 'renewal-2027-sandbox' }))).toBe('renewal');
    expect(courseKind(course({ slug: 'renewal' }))).toBe('renewal');
    expect(courseKind(course({ slug: 'annual-renewal' }))).toBe('renewal');
    // Must not swallow an unrelated course whose slug merely contains the word.
    expect(courseKind(course({ slug: 'renewables-and-energy' }))).toBe('flagship');
  });

  it('defaults an ungated, non-renewal course to flagship', () => {
    expect(courseKind(course({ slug: 'fpt-sandbox' }))).toBe('flagship');
  });
});
