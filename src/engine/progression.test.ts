import { describe, expect, it } from 'vitest';
import type {
  CompletionEvidence,
  LmsCourse,
  LmsEnrollment,
  LmsLesson,
  LmsLessonProgress,
  LmsModule,
  LmsModuleQuiz,
  LmsQuizAttempt,
  LmsSurveyResponse,
} from '../data/types';
import {
  courseComplete,
  courseUnlocked,
  lessonComplete,
  meetsPassThreshold,
  moduleUnlocked,
  nextAttemptNumber,
  quizAttemptable,
  termsGateSatisfied,
} from './progression';

const course = (progression: LmsCourse['progression'] = 'sequential'): LmsCourse => ({
  id: 'course-1',
  slug: 'course-1',
  title: 'Course',
  description: 'Synthetic course',
  status: 'published',
  progression,
  prerequisite_course_id: null,
  ce_credits: 1,
  requires_terms_acceptance: false,
  created_at: '2026-01-01T00:00:00.000Z',
});

const modules: LmsModule[] = [1, 2, 3].map((position) => ({
  id: `module-${position}`,
  course_id: 'course-1',
  position,
  title: `Module ${position}`,
  ce_credits: null,
}));

const lessons: LmsLesson[] = modules.map((module) => ({
  id: `lesson-${module.position}`,
  module_id: module.id,
  position: 1,
  title: `Lesson ${module.position}`,
  kind: 'reading',
  video_ref: null,
  duration_seconds: null,
  body_md: 'Synthetic reading',
  is_required: true,
}));

const quizzes: LmsModuleQuiz[] = [1, 2, 3].map((position) => ({
  id: `quiz-${position}`,
  module_id: `module-${position}`,
  question_count: 10,
  pass_pct: 70,
}));

const completeProgress = (lesson: LmsLesson): LmsLessonProgress => ({
  id: `progress-${lesson.id}`,
  enrollment_id: 'enrollment-1',
  lesson_id: lesson.id,
  started_at: '2026-01-01T00:00:00.000Z',
  completed_at: '2026-01-01T00:10:00.000Z',
  last_position_seconds: lesson.duration_seconds ?? 0,
  max_watched_seconds: lesson.duration_seconds ?? 0,
  max_watched_updated_at: '2026-01-01T00:10:00.000Z',
  updated_at: '2026-01-01T00:10:00.000Z',
});

const attempt = (
  quizId: string,
  attemptNumber: number,
  passed: boolean,
): LmsQuizAttempt => ({
  id: `${quizId}-${attemptNumber}`,
  enrollment_id: 'enrollment-1',
  quiz_id: quizId,
  attempt_number: attemptNumber,
  started_at: '2026-01-01T00:00:00.000Z',
  submitted_at: '2026-01-01T00:05:00.000Z',
  answers: {},
  score: passed ? 7 : 6,
  passed,
});

const context = (
  module: LmsModule,
  overrides: Partial<{
    course: LmsCourse;
    quizzes: LmsModuleQuiz[];
    lessons: LmsLesson[];
    progress: LmsLessonProgress[];
    surveyResponses: LmsSurveyResponse[];
    attempts: LmsQuizAttempt[];
  }> = {},
) => ({
  course: overrides.course ?? course(),
  module,
  modules,
  lessons: overrides.lessons ?? lessons,
  quizzes: overrides.quizzes ?? quizzes,
  progress: overrides.progress ?? [],
  surveyResponses: overrides.surveyResponses ?? [],
  attempts: overrides.attempts ?? [],
});

describe('course prerequisite and terms gates', () => {
  it('locks a prerequisite course until the prerequisite completion event exists', () => {
    const bonus = { ...course('open'), id: 'bonus', prerequisite_course_id: 'course-1' };
    const completion: CompletionEvidence = {
      id: 'complete-1',
      enrollment_id: 'enrollment-1',
      course_id: 'course-1',
      completed_at: '2026-01-01T00:00:00.000Z',
      trigger: 'all_requirements_met',
      processed_at: null,
      designation_issued: false,
    };

    expect(courseUnlocked(bonus, [])).toBe(false);
    expect(courseUnlocked(bonus, [completion])).toBe(true);
  });

  it('blocks course content until required terms are accepted', () => {
    const gatedCourse = { ...course(), requires_terms_acceptance: true };
    const enrollment: LmsEnrollment = {
      id: 'enrollment-1',
      person_email: 'learner@example.test',
      auth_user_id: 'auth-1',
      course_id: gatedCourse.id,
      source: 'synthetic',
      enrolled_at: '2026-01-01T00:00:00.000Z',
      expires_at: null,
      status: 'active',
      terms_accepted_at: null,
      order_id: null,
    };

    expect(termsGateSatisfied(gatedCourse, enrollment)).toBe(false);
    expect(termsGateSatisfied(gatedCourse, { ...enrollment, terms_accepted_at: createdAt() })).toBe(true);
  });
});

describe('module progression', () => {
  it('unlocks a lowest-position module at position 1 with no prior passes', () => {
    expect(moduleUnlocked(context(modules[0]))).toBe(true);
  });

  it('unlocks a lowest-position module at position 0 with no prior passes', () => {
    const introduction = { ...modules[0], id: 'module-0', position: 0 };
    expect(moduleUnlocked({
      ...context(introduction),
      module: introduction,
      modules: [introduction, ...modules],
    })).toBe(true);
  });

  it('locks module N until module N-1 has a passed quiz attempt', () => {
    expect(moduleUnlocked(context(modules[1]))).toBe(false);
    expect(
      moduleUnlocked(context(modules[1], { attempts: [attempt('quiz-1', 1, true)] })),
    ).toBe(true);
  });

  it('treats a quizless previous module as passed after required lessons complete', () => {
    const withoutFirstQuiz = quizzes.filter((quiz) => quiz.module_id !== 'module-1');
    expect(moduleUnlocked(context(modules[1], { quizzes: withoutFirstQuiz }))).toBe(false);
    expect(
      moduleUnlocked(
        context(modules[1], {
          quizzes: withoutFirstQuiz,
          progress: [completeProgress(lessons[0])],
        }),
      ),
    ).toBe(true);
  });

  it('never sequentially locks modules in an open course', () => {
    expect(moduleUnlocked(context(modules[2], { course: course('open') }))).toBe(true);
  });
});

describe('quiz attempt rules', () => {
  it('does not allow a quiz attempt while a required lesson is incomplete', () => {
    expect(quizAttemptable(context(modules[0]))).toBe(false);
    expect(
      quizAttemptable(context(modules[0], { progress: [completeProgress(lessons[0])] })),
    ).toBe(true);
  });

  it('does not let a required survey gate its module quiz', () => {
    const survey: LmsLesson = {
      ...lessons[0],
      id: 'survey-1',
      position: 2,
      kind: 'survey',
    };
    expect(quizAttemptable(context(modules[0], {
      lessons: [lessons[0], survey],
      progress: [completeProgress(lessons[0])],
    }))).toBe(true);
  });

  it('allows unlimited attempts by always returning the next sequence number', () => {
    const attempts = Array.from({ length: 25 }, (_, index) =>
      attempt('quiz-1', index + 1, false),
    );
    expect(nextAttemptNumber('quiz-1', attempts)).toBe(26);
  });

  it('honors the 70 percent boundary exactly', () => {
    expect(meetsPassThreshold(7, 10, 70)).toBe(true);
    expect(meetsPassThreshold(6, 10, 70)).toBe(false);
  });
});

describe('completion rules', () => {
  it('marks video complete only at max_watched >= 95 percent', () => {
    const video: LmsLesson = {
      ...lessons[0],
      kind: 'video',
      duration_seconds: 100,
      video_ref: 'placeholder://video',
    };
    const record = completeProgress(video);

    expect(lessonComplete(video, [{ ...record, max_watched_seconds: 94.99 }])).toBe(false);
    expect(lessonComplete(video, [{ ...record, max_watched_seconds: 95 }])).toBe(true);
  });

  it('requires every required lesson and every existing module quiz, with no cumulative exam', () => {
    const allProgress = lessons.map(completeProgress);
    const allModuleAttempts = quizzes.map((quiz) => attempt(quiz.id, 1, true));

    expect(
      courseComplete(course(), modules, lessons, quizzes, allProgress, allModuleAttempts),
    ).toBe(true);
    expect(
      courseComplete(course(), modules, lessons, quizzes, allProgress.slice(0, 2), allModuleAttempts),
    ).toBe(false);
    expect(
      courseComplete(course(), modules, lessons, quizzes, allProgress, allModuleAttempts.slice(0, 2)),
    ).toBe(false);

    const cumulativeAttempt = attempt('cumulative-exam', 1, true);
    expect(
      courseComplete(course(), modules, lessons, quizzes, allProgress, [cumulativeAttempt]),
    ).toBe(false);
  });

  it('blocks course completion until required surveys have responses', () => {
    const survey: LmsLesson = {
      ...lessons[0],
      id: 'survey-required',
      position: 2,
      kind: 'survey',
    };
    const response: LmsSurveyResponse = {
      id: 'response-1',
      enrollment_id: 'enrollment-1',
      lesson_id: survey.id,
      submitted_at: createdAt(),
      answers: {},
      choice_free_text: {},
      path: ['section-1'],
    };
    const allProgress = lessons.map(completeProgress);
    const allAttempts = quizzes.map((quiz) => attempt(quiz.id, 1, true));

    expect(courseComplete(
      course(),
      modules,
      [...lessons, survey],
      quizzes,
      allProgress,
      allAttempts,
      [],
    )).toBe(false);
    expect(courseComplete(
      course(),
      modules,
      [...lessons, survey],
      quizzes,
      allProgress,
      allAttempts,
      [response],
    )).toBe(true);
  });

  it('does not let an optional survey block course completion', () => {
    const optionalSurvey: LmsLesson = {
      ...lessons[0],
      id: 'survey-optional',
      position: 2,
      kind: 'survey',
      is_required: false,
    };
    expect(courseComplete(
      course(),
      modules,
      [...lessons, optionalSurvey],
      quizzes,
      lessons.map(completeProgress),
      quizzes.map((quiz) => attempt(quiz.id, 1, true)),
      [],
    )).toBe(true);
  });
});

function createdAt() {
  return '2026-01-01T00:00:00.000Z';
}
