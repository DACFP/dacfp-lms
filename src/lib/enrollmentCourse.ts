import type {
  Catalog,
  LearnerSnapshot,
  LmsCourse,
  LmsEnrollment,
} from '../data/types';
import { enrollmentAccessState } from './progress';

/**
 * Resolves ordinary catalog metadata first. For an expired enrollment only,
 * it can fall back to the learner-safe identity summary returned by the
 * sandbox. The fallback deliberately contains no course content.
 */
export function courseForEnrollment(
  catalog: Catalog,
  enrollment: LmsEnrollment,
): LmsCourse | null {
  const catalogCourse = catalog.courses.find(
    (course) => course.id === enrollment.course_id,
  );
  if (catalogCourse) return catalogCourse;

  const summary = enrollment.course_summary;
  if (
    enrollmentAccessState(enrollment) !== 'expired' ||
    !summary ||
    summary.course_id !== enrollment.course_id
  ) {
    return null;
  }

  return {
    id: summary.course_id,
    slug: summary.slug,
    title: summary.title,
    description: '',
    status: summary.status,
    progression: 'sequential',
    prerequisite_course_id: summary.prerequisite_course_id,
    ce_credits: null,
    cfp_program_id: null,
    requires_terms_acceptance: false,
    created_at: enrollment.enrolled_at,
  };
}

export function expiredEnrollmentForLesson(
  snapshot: LearnerSnapshot,
  lessonId: string | undefined,
) {
  if (!lessonId) return null;
  const progress = snapshot.progress.find((row) => row.lesson_id === lessonId);
  if (!progress) return null;
  const enrollment = snapshot.enrollments.find(
    (row) => row.id === progress.enrollment_id,
  );
  return enrollment && enrollmentAccessState(enrollment) === 'expired'
    ? enrollment
    : null;
}

export function expiredEnrollmentForCourseSlug(
  snapshot: LearnerSnapshot,
  slug: string | undefined,
) {
  if (!slug) return null;
  return (
    snapshot.enrollments.find(
      (enrollment) =>
        enrollment.course_summary?.slug === slug &&
        enrollmentAccessState(enrollment) === 'expired',
    ) ?? null
  );
}
