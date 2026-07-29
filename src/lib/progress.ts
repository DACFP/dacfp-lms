import {
  courseComplete,
  lessonComplete,
  moduleRequirementsComplete,
  moduleUnlocked,
  quizAttemptable,
} from '../engine';
import type {
  Catalog,
  LearnerSnapshot,
  LmsCourse,
  LmsEnrollment,
  LmsLesson,
  LmsModule,
  LmsModuleQuiz,
} from '../data/types';

export type CourseBlocker =
  | {
      kind: 'lesson';
      module: LmsModule;
      lesson: LmsLesson;
      path: string;
    }
  | {
      kind: 'quiz';
      module: LmsModule;
      quiz: LmsModuleQuiz;
      path: string;
    };

export function enrollmentForCourse(snapshot: LearnerSnapshot, courseId: string) {
  return snapshot.enrollments.find((item) => item.course_id === courseId) ?? null;
}

export function enrollmentAccessState(
  enrollment: LmsEnrollment,
  now = Date.now(),
): 'active' | 'expired' | 'revoked' {
  if (enrollment.status === 'revoked') return 'revoked';
  if (
    enrollment.status === 'expired' ||
    (enrollment.expires_at !== null &&
      new Date(enrollment.expires_at).getTime() <= now)
  ) {
    return 'expired';
  }
  return 'active';
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
    surveyResponses: snapshot.surveyResponses.filter(
      (item) => item.enrollment_id === enrollmentId,
    ),
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

export function moduleIsPassed(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  module: LmsModule,
) {
  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) return false;
  const attempts = snapshot.attempts.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const quiz = catalog.quizzes.find((item) => item.module_id === module.id);
  if (quiz) {
    return attempts.some(
      (attempt) => attempt.quiz_id === quiz.id && attempt.passed === true,
    );
  }
  return moduleRequirementsComplete(
    module,
    catalog.lessons,
    snapshot.progress.filter((item) => item.enrollment_id === enrollment.id),
    snapshot.surveyResponses.filter((item) => item.enrollment_id === enrollment.id),
  );
}

export function resumeModuleForCourse(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
) {
  const modules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((a, b) => a.position - b.position);
  return (
    modules.find(
      (module) =>
        moduleIsUnlocked(catalog, snapshot, course, module) &&
        !moduleIsPassed(catalog, snapshot, course, module),
    ) ?? modules.at(-1)
  );
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
  const surveyResponses = snapshot.surveyResponses.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const attempts = snapshot.attempts.filter((item) => item.enrollment_id === enrollment.id);
  const completedLessonCount = requiredLessons.filter((lesson) =>
    lessonComplete(lesson, progress, surveyResponses),
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
    snapshot.surveyResponses.filter((item) => item.enrollment_id === enrollment.id),
  );
}

/**
 * Returns the nearest requirement that actually blocks sequential progression.
 * Quiz-less modules can be blocked by required lessons (including surveys);
 * modules with a quiz first point to an incomplete quiz-gating lesson, then to
 * the quiz itself. This mirrors the progression engine instead of assuming
 * every prior module owns a quiz.
 */
export function courseProgressionBlocker(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
): CourseBlocker | null {
  if (course.progression !== 'sequential') return null;
  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) return null;

  const progress = snapshot.progress.filter((item) => item.enrollment_id === enrollment.id);
  const surveyResponses = snapshot.surveyResponses.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const modules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((left, right) => left.position - right.position);

  for (const module of modules) {
    if (moduleIsPassed(catalog, snapshot, course, module)) continue;
    const quiz = catalog.quizzes.find((item) => item.module_id === module.id);
    const requiredLessons = catalog.lessons
      .filter(
        (lesson) =>
          lesson.module_id === module.id &&
          lesson.is_required &&
          (!quiz || lesson.kind !== 'survey'),
      )
      .sort((left, right) => left.position - right.position);
    const incompleteLesson = requiredLessons.find(
      (lesson) => !lessonComplete(lesson, progress, surveyResponses),
    );

    if (incompleteLesson) {
      return {
        kind: 'lesson',
        module,
        lesson: incompleteLesson,
        path: `/lesson/${incompleteLesson.id}`,
      };
    }
    if (quiz) {
      return {
        kind: 'quiz',
        module,
        quiz,
        path: `/quiz/${module.id}`,
      };
    }
  }

  return null;
}

export function blockerGuidance(
  blocker: CourseBlocker,
  targetModule: LmsModule | null,
) {
  const unlockTarget = targetModule
    ? ` to unlock Module ${targetModule.position}`
    : ' to continue';

  if (blocker.kind === 'quiz') {
    return {
      message: `Pass Module ${blocker.module.position}'s quiz${unlockTarget}.`,
      action: `Go to Module ${blocker.module.position} quiz`,
    };
  }

  if (blocker.module.position !== 0) {
    return {
      message: `Complete all required lessons in Module ${blocker.module.position}, then pass its quiz${unlockTarget}. Start with “${blocker.lesson.title}”.`,
      action: `Open ${blocker.lesson.title}`,
    };
  }

  if (blocker.module.position === 0 && blocker.lesson.kind === 'survey') {
    return {
      message: `Complete the Introduction survey “${blocker.lesson.title}”${unlockTarget}.`,
      action: 'Open Introduction survey',
    };
  }

  const moduleName =
    blocker.module.position === 0
      ? 'Introduction'
      : `Module ${blocker.module.position}`;
  return {
    message: `Complete “${blocker.lesson.title}” in ${moduleName}${unlockTarget}.`,
    action: `Open ${blocker.lesson.title}`,
  };
}
