import {
  courseComplete,
  lessonComplete,
  moduleUnlocked,
  quizAttemptable,
} from '../engine';
import type {
  Catalog,
  LearnerSnapshot,
  LmsCourse,
  LmsEnrollment,
  LmsModule,
} from '../data/types';

export function enrollmentForCourse(snapshot: LearnerSnapshot, courseId: string) {
  return snapshot.enrollments.find((item) => item.course_id === courseId) ?? null;
}

export function moduleContext(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  module: LmsModule,
) {
  const enrollment = enrollmentForCourse(snapshot, course.id);
  const enrollmentId = enrollment?.id;
  return {
    course,
    module,
    modules: catalog.modules.filter((item) => item.course_id === course.id),
    lessons: catalog.lessons,
    quizzes: catalog.quizzes,
    progress: snapshot.progress.filter((item) => item.enrollment_id === enrollmentId),
    attempts: snapshot.attempts.filter((item) => item.enrollment_id === enrollmentId),
  };
}

export function moduleIsUnlocked(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  module: LmsModule,
) {
  return moduleUnlocked(moduleContext(catalog, snapshot, course, module));
}

export function quizIsAttemptable(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  module: LmsModule,
) {
  return quizAttemptable(moduleContext(catalog, snapshot, course, module));
}

export function courseProgressPercent(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  enrollment: LmsEnrollment,
) {
  const moduleIds = new Set(
    catalog.modules.filter((item) => item.course_id === course.id).map((item) => item.id),
  );
  const requiredLessons = catalog.lessons.filter(
    (lesson) => moduleIds.has(lesson.module_id) && lesson.is_required,
  );
  const quizzes = catalog.quizzes.filter((quiz) => moduleIds.has(quiz.module_id));
  const progress = snapshot.progress.filter((item) => item.enrollment_id === enrollment.id);
  const attempts = snapshot.attempts.filter((item) => item.enrollment_id === enrollment.id);
  const completedLessonCount = requiredLessons.filter((lesson) =>
    lessonComplete(lesson, progress),
  ).length;
  const passedQuizCount = quizzes.filter((quiz) =>
    attempts.some((attempt) => attempt.quiz_id === quiz.id && attempt.passed === true),
  ).length;
  const possible = requiredLessons.length + quizzes.length;

  if (possible === 0) return 0;
  return Math.round(((completedLessonCount + passedQuizCount) / possible) * 100);
}

export function isCourseComplete(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
) {
  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) return false;
  return courseComplete(
    course,
    catalog.modules,
    catalog.lessons,
    catalog.quizzes,
    snapshot.progress.filter((item) => item.enrollment_id === enrollment.id),
    snapshot.attempts.filter((item) => item.enrollment_id === enrollment.id),
  );
}
