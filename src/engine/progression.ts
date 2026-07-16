import type {
  CompletionEvidence,
  LmsCourse,
  LmsEnrollment,
  LmsLesson,
  LmsLessonProgress,
  LmsModule,
  LmsModuleQuiz,
  LmsQuizAttempt,
} from '../data/types';

export interface ProgressionContext {
  course: LmsCourse;
  module: LmsModule;
  modules: LmsModule[];
  lessons: LmsLesson[];
  quizzes: LmsModuleQuiz[];
  progress: LmsLessonProgress[];
  attempts: LmsQuizAttempt[];
}

const hasPassedAttempt = (quizId: string, attempts: LmsQuizAttempt[]) =>
  attempts.some((attempt) => attempt.quiz_id === quizId && attempt.passed === true);

export function courseUnlocked(
  course: LmsCourse,
  completions: CompletionEvidence[],
): boolean {
  return (
    course.prerequisite_course_id === null ||
    completions.some(
      (completion) => completion.course_id === course.prerequisite_course_id,
    )
  );
}

export function termsGateSatisfied(
  course: LmsCourse,
  enrollment: LmsEnrollment,
): boolean {
  return !course.requires_terms_acceptance || enrollment.terms_accepted_at !== null;
}

export function lessonComplete(
  lesson: LmsLesson,
  progress: LmsLessonProgress[],
): boolean {
  const record = progress.find((item) => item.lesson_id === lesson.id);
  if (!record) return false;

  if (lesson.kind === 'reading') return record.completed_at !== null;
  if (!lesson.duration_seconds || lesson.duration_seconds <= 0) return false;

  return record.max_watched_seconds >= lesson.duration_seconds * 0.95;
}

export function moduleRequirementsComplete(
  module: LmsModule,
  lessons: LmsLesson[],
  progress: LmsLessonProgress[],
): boolean {
  return lessons
    .filter((lesson) => lesson.module_id === module.id && lesson.is_required)
    .every((lesson) => lessonComplete(lesson, progress));
}

export function moduleUnlocked(context: ProgressionContext): boolean {
  const { course, module, modules, lessons, quizzes, progress, attempts } = context;

  if (course.progression === 'open' || module.position === 1) return true;

  const previousModule = modules.find(
    (candidate) =>
      candidate.course_id === course.id && candidate.position === module.position - 1,
  );
  if (!previousModule) return false;

  const previousQuiz = quizzes.find((quiz) => quiz.module_id === previousModule.id);
  if (previousQuiz) return hasPassedAttempt(previousQuiz.id, attempts);

  return moduleRequirementsComplete(previousModule, lessons, progress);
}

export function quizAttemptable(context: ProgressionContext): boolean {
  return (
    moduleUnlocked(context) &&
    moduleRequirementsComplete(context.module, context.lessons, context.progress)
  );
}

export function nextAttemptNumber(
  quizId: string,
  attempts: LmsQuizAttempt[],
): number {
  const highest = attempts
    .filter((attempt) => attempt.quiz_id === quizId)
    .reduce((max, attempt) => Math.max(max, attempt.attempt_number), 0);
  return highest + 1;
}

export function meetsPassThreshold(
  score: number,
  possiblePoints: number,
  passPct: number,
): boolean {
  if (possiblePoints <= 0) return false;
  return (score / possiblePoints) * 100 >= passPct;
}

export function courseComplete(
  course: LmsCourse,
  modules: LmsModule[],
  lessons: LmsLesson[],
  quizzes: LmsModuleQuiz[],
  progress: LmsLessonProgress[],
  attempts: LmsQuizAttempt[],
): boolean {
  const courseModuleIds = new Set(
    modules.filter((module) => module.course_id === course.id).map((module) => module.id),
  );
  const requiredLessons = lessons.filter(
    (lesson) => courseModuleIds.has(lesson.module_id) && lesson.is_required,
  );
  const courseQuizzes = quizzes.filter((quiz) => courseModuleIds.has(quiz.module_id));

  return (
    requiredLessons.every((lesson) => lessonComplete(lesson, progress)) &&
    courseQuizzes.every((quiz) => hasPassedAttempt(quiz.id, attempts))
  );
}
