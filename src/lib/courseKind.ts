import type { LmsCourse } from '../data/types';

export type CourseKind = 'flagship' | 'renewal' | 'library';

/**
 * PRESENTATION-ONLY grouping for the dashboard IA (SPEC-OVERHAUL §2a-c):
 * FPT is the hero, renewal is a time-bound event surface, everything else is
 * the subordinate library.
 *
 * The schema has no course-kind column, and adding one would be a server
 * change — frozen. So the kind is derived from what the catalog already says,
 * tailored to the known catalog per Hard Rule 11 rather than built as a rules
 * engine:
 *
 *   library  — the course has a prerequisite. Something must be completed
 *              before it opens, which is exactly what "unlocked bonus" means.
 *   renewal  — the slug names it. Annual renewals are their own product line
 *              at DACFP and are slugged as such (renewal-2026-sandbox).
 *   flagship — the rest. In the real catalog that is the Financial
 *              Professional Track.
 *
 * FLAGGED: this is a heuristic over naming, not an entitlement fact. Promotion
 * owns real renewal entitlement wiring (§4, out of O-scope); when that lands,
 * this should be replaced by the server's own signal rather than extended.
 */
const RENEWAL_SLUG = /(?:^|-)renewal(?:-|$)/i;

export function courseKind(course: LmsCourse): CourseKind {
  if (course.prerequisite_course_id !== null) return 'library';
  if (RENEWAL_SLUG.test(course.slug)) return 'renewal';
  return 'flagship';
}
