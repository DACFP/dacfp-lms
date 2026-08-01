import type { LearnerInspection } from '../data/admin';
import type {
  Catalog,
  LearnerSnapshot,
  LmsCourse,
  LmsLesson,
  LmsModule,
  LmsModuleQuiz,
} from '../data/types';
import { lessonComplete } from '../engine';

/**
 * Adapts the admin LearnerInspection payload into the LearnerSnapshot shape
 * that src/lib/progress.ts operates on, so the learner file computes blocker
 * chains with the exact functions the learner app uses — never a parallel
 * derivation.
 */
export function inspectionToSnapshot(inspection: LearnerInspection): LearnerSnapshot {
  const courseByEnrollment = new Map(
    inspection.enrollments.map((enrollment) => [enrollment.id, enrollment.lms_courses.id]),
  );
  return {
    learner: {
      id: 'fresh',
      label: inspection.user.email,
      description: 'admin learner file',
      email: inspection.user.email,
    },
    profile: {
      auth_user_id: inspection.user.id,
      display_name: inspection.profile?.display_name ?? '',
      first_name: inspection.profile?.first_name ?? '',
      middle_name: inspection.profile?.middle_name ?? null,
      last_name: inspection.profile?.last_name ?? '',
      firm: inspection.profile?.firm ?? '',
      job_title: inspection.profile?.job_title ?? '',
      phone: inspection.profile?.phone ?? null,
      firm_url: inspection.profile?.firm_url ?? null,
      address: inspection.profile?.address ?? null,
      email: inspection.user.email,
      credential_ids: inspection.profile?.credential_ids ?? {},
      created_at: inspection.profile?.created_at ?? '',
      updated_at: inspection.profile?.updated_at ?? '',
    },
    enrollments: inspection.enrollments,
    progress: inspection.progress,
    attempts: inspection.attempts,
    surveyResponses: inspection.surveyResponses,
    completions: inspection.completions.map((completion) => ({
      ...completion,
      course_id: courseByEnrollment.get(completion.enrollment_id) ?? '',
    })),
    ceReportingStatuses: [],
  };
}

export interface RemainingModuleRequirements {
  module: LmsModule;
  lessons: LmsLesson[];
  quiz: LmsModuleQuiz | null;
}

/**
 * Every requirement still standing between this enrollment and course
 * completion, module by module: incomplete required lessons plus any module
 * quiz without a passed attempt. Derived with the engine's own
 * lessonComplete, so it can never disagree with the learner experience.
 */
export function remainingRequirements(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
): RemainingModuleRequirements[] {
  const enrollment = snapshot.enrollments.find((item) => item.course_id === course.id);
  if (!enrollment) return [];
  const progress = snapshot.progress.filter((item) => item.enrollment_id === enrollment.id);
  const surveyResponses = snapshot.surveyResponses.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const attempts = snapshot.attempts.filter((item) => item.enrollment_id === enrollment.id);
  const modules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((left, right) => left.position - right.position);

  return modules
    .map((module) => {
      const lessons = catalog.lessons
        .filter((lesson) => lesson.module_id === module.id && lesson.is_required)
        .filter((lesson) => !lessonComplete(lesson, progress, surveyResponses))
        .sort((left, right) => left.position - right.position);
      const quiz = catalog.quizzes.find((item) => item.module_id === module.id) ?? null;
      const quizPassed = quiz
        ? attempts.some((attempt) => attempt.quiz_id === quiz.id && attempt.passed === true)
        : true;
      return { module, lessons, quiz: quizPassed ? null : quiz };
    })
    .filter((entry) => entry.lessons.length > 0 || entry.quiz !== null);
}

export function addOneYear(value: string) {
  const date = new Date(value);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}
