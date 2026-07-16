import type { LmsProvider } from './provider';
import type {
  Catalog,
  CompletionEvidence,
  LearnerSnapshot,
  LearnerStateKey,
  LearnerSummary,
  LmsCourse,
  LmsEnrollment,
  LmsLearnerProfile,
  LmsLesson,
  LmsLessonProgress,
  LmsModule,
  LmsModuleQuiz,
  LmsQuizAttempt,
} from './types';

const createdAt = '2026-07-16T16:00:00.000Z';
const futureExpiry = '2027-07-16T23:59:59.000Z';

const courses: LmsCourse[] = [
  {
    id: 'course-fpt',
    slug: 'fpt-sandbox',
    title: 'FPT Sandbox',
    description: 'A four-module preview of the Financial Professional Track.',
    status: 'published',
    progression: 'sequential',
    prerequisite_course_id: null,
    ce_credits: 18,
    requires_terms_acceptance: true,
    created_at: createdAt,
  },
  {
    id: 'course-bonus',
    slug: 'bonus-sandbox',
    title: 'Bonus Sandbox',
    description: 'Open bonus learning unlocked after FPT completion.',
    status: 'published',
    progression: 'open',
    prerequisite_course_id: 'course-fpt',
    ce_credits: 3,
    requires_terms_acceptance: false,
    created_at: createdAt,
  },
  {
    id: 'course-renewal-2026',
    slug: 'renewal-2026-sandbox',
    title: 'Renewal 2026 Sandbox',
    description: 'A one-module annual renewal course preview.',
    status: 'published',
    progression: 'sequential',
    prerequisite_course_id: null,
    ce_credits: 1,
    requires_terms_acceptance: false,
    created_at: createdAt,
  },
];

const modules: LmsModule[] = [
  { id: 'fpt-m1', course_id: 'course-fpt', position: 1, title: 'Bitcoin Foundations', ce_credits: 4.5 },
  { id: 'fpt-m2', course_id: 'course-fpt', position: 2, title: 'Blockchain and DLT', ce_credits: 4.5 },
  { id: 'fpt-m3', course_id: 'course-fpt', position: 3, title: 'Digital Assets and Currencies', ce_credits: 4.5 },
  { id: 'fpt-m4', course_id: 'course-fpt', position: 4, title: 'Layer 2, Tokens, and DeFi', ce_credits: 4.5 },
  { id: 'bonus-m1', course_id: 'course-bonus', position: 1, title: 'Portfolio Case Study', ce_credits: 1 },
  { id: 'bonus-m2', course_id: 'course-bonus', position: 2, title: 'Advisor Conversation Lab', ce_credits: 1 },
  { id: 'bonus-m3', course_id: 'course-bonus', position: 3, title: 'Market Structure Briefing', ce_credits: 1 },
  { id: 'renewal-m1', course_id: 'course-renewal-2026', position: 1, title: '2026 Annual Update', ce_credits: 1 },
];

function moduleLessons(module: LmsModule, duration = 600): LmsLesson[] {
  return [
    {
      id: `${module.id}-video`,
      module_id: module.id,
      position: 1,
      title: `${module.title}: Video lesson`,
      kind: 'video',
      video_ref: `placeholder://${module.id}`,
      duration_seconds: duration,
      body_md: null,
      is_required: true,
    },
    {
      id: `${module.id}-reading`,
      module_id: module.id,
      position: 2,
      title: `${module.title}: Key concepts`,
      kind: 'reading',
      video_ref: null,
      duration_seconds: null,
      body_md: 'Synthetic reading content for the dark-build preview.',
      is_required: true,
    },
    {
      id: `${module.id}-reference`,
      module_id: module.id,
      position: 3,
      title: `${module.title}: Optional reference`,
      kind: 'reading',
      video_ref: null,
      duration_seconds: null,
      body_md: 'Optional reference material.',
      is_required: false,
    },
  ];
}

const lessons = modules.flatMap((module) =>
  moduleLessons(module, module.id === 'renewal-m1' ? 3600 : 600),
);

const resources = [
  {
    id: 'resource-fpt-guide',
    lesson_id: 'fpt-m1-reading',
    position: 1,
    title: 'Bitcoin foundations workbook (placeholder)',
    file_ref: '/mock-resources/bitcoin-foundations-workbook.txt',
  },
  {
    id: 'resource-bonus-case-study',
    lesson_id: 'bonus-m1-reading',
    position: 1,
    title: 'Portfolio case study (placeholder)',
    file_ref: '/mock-resources/portfolio-case-study.txt',
  },
  {
    id: 'resource-renewal-notes',
    lesson_id: 'renewal-m1-reading',
    position: 1,
    title: '2026 renewal notes (placeholder)',
    file_ref: '/mock-resources/renewal-2026-notes.txt',
  },
];

const quizzes: LmsModuleQuiz[] = [
  ...modules
    .filter((module) => module.course_id === 'course-fpt')
    .map((module) => ({
      id: `quiz-${module.id}`,
      module_id: module.id,
      question_count: 10,
      pass_pct: 70,
    })),
  {
    id: 'quiz-renewal-m1',
    module_id: 'renewal-m1',
    question_count: 10,
    pass_pct: 70,
  },
];

export const mockCatalog: Catalog = { courses, modules, lessons, resources, quizzes };

const learnerSummaries: LearnerSummary[] = [
  { id: 'fresh', label: 'Fresh learner', description: 'Terms not yet accepted', email: 'fresh@example.test' },
  { id: 'mid-module-2', label: 'Mid-module 2', description: 'Resuming required content', email: 'midmodule@example.test' },
  { id: 'quiz-failed-on-3', label: 'Quiz failed on 3', description: 'Retake is available', email: 'failedquiz@example.test' },
  { id: 'one-quiz-from-done', label: 'One quiz from done', description: 'Final FPT quiz remains', email: 'almostdone@example.test' },
  { id: 'fpt-completed', label: 'FPT completed', description: 'Bonus unlocked; renewal enrolled', email: 'fptcomplete@example.test' },
  { id: 'fully-complete', label: 'Fully complete', description: 'FPT, bonus, and renewal complete', email: 'complete@example.test' },
];

function enrollment(
  learner: LearnerSummary,
  courseId: string,
  termsAccepted: boolean,
): LmsEnrollment {
  const courseSuffix = courseId.replace('course-', '');
  return {
    id: `${learner.id}-enroll-${courseSuffix}`,
    person_email: learner.email,
    auth_user_id: `auth-${learner.id}`,
    course_id: courseId,
    source: 'synthetic',
    enrolled_at: createdAt,
    expires_at: futureExpiry,
    status: 'active',
    terms_accepted_at: termsAccepted ? '2026-07-16T16:05:00.000Z' : null,
    order_id: null,
  };
}

function completedProgress(
  enrollmentId: string,
  learnerId: string,
  selectedLessons: LmsLesson[],
): LmsLessonProgress[] {
  return selectedLessons.map((lesson) => ({
    id: `${learnerId}-progress-${lesson.id}`,
    enrollment_id: enrollmentId,
    lesson_id: lesson.id,
    started_at: '2026-07-16T16:10:00.000Z',
    completed_at: '2026-07-16T16:30:00.000Z',
    last_position_seconds: lesson.duration_seconds ?? 0,
    max_watched_seconds: lesson.duration_seconds ?? 0,
    updated_at: '2026-07-16T16:30:00.000Z',
  }));
}

function attempt(
  enrollmentId: string,
  learnerId: string,
  quiz: LmsModuleQuiz,
  attemptNumber: number,
  score: number,
): LmsQuizAttempt {
  return {
    id: `${learnerId}-attempt-${quiz.id}-${attemptNumber}`,
    enrollment_id: enrollmentId,
    quiz_id: quiz.id,
    attempt_number: attemptNumber,
    started_at: '2026-07-16T16:35:00.000Z',
    submitted_at: '2026-07-16T16:40:00.000Z',
    answers: {},
    score,
    passed: score >= 7,
  };
}

function completion(
  enrollmentId: string,
  learnerId: string,
  courseId: string,
): CompletionEvidence {
  return {
    id: `${learnerId}-completion-${courseId}`,
    enrollment_id: enrollmentId,
    course_id: courseId,
    completed_at: '2026-07-16T17:00:00.000Z',
    trigger: 'all_requirements_met',
    processed_at: null,
    designation_issued: false,
  };
}

function courseLessons(courseId: string) {
  const moduleIds = new Set(
    modules.filter((module) => module.course_id === courseId).map((module) => module.id),
  );
  return lessons.filter((lesson) => moduleIds.has(lesson.module_id));
}

function courseQuizzes(courseId: string) {
  const moduleIds = new Set(
    modules.filter((module) => module.course_id === courseId).map((module) => module.id),
  );
  return quizzes.filter((quiz) => moduleIds.has(quiz.module_id));
}

function baseSnapshot(learner: LearnerSummary): LearnerSnapshot {
  return {
    learner,
    profile: {
      auth_user_id: `auth-${learner.id}`,
      display_name: learner.label,
      email: learner.email,
      credential_ids:
        learner.id === 'fully-complete'
          ? { cfp: 'SYNTH-CFP-1042', iwi: 'SYNTH-IWI-2084', cfa: 'SYNTH-CFA-4096' }
          : {},
      created_at: createdAt,
      updated_at: createdAt,
    },
    enrollments: [],
    progress: [],
    attempts: [],
    completions: [],
  };
}

function buildSnapshots(): Record<LearnerStateKey, LearnerSnapshot> {
  const snapshots = Object.fromEntries(
    learnerSummaries.map((learner) => [learner.id, baseSnapshot(learner)]),
  ) as Record<LearnerStateKey, LearnerSnapshot>;

  for (const learner of learnerSummaries) {
    const snapshot = snapshots[learner.id];
    const fpt = enrollment(learner, 'course-fpt', learner.id !== 'fresh');
    const bonus = enrollment(learner, 'course-bonus', true);
    snapshot.enrollments.push(fpt, bonus);
  }

  const mid = snapshots['mid-module-2'];
  const midFpt = mid.enrollments[0];
  mid.progress.push(
    ...completedProgress(midFpt.id, mid.learner.id, lessons.filter((lesson) => lesson.module_id === 'fpt-m1')),
    {
      id: 'mid-module-progress-fpt-m2-video',
      enrollment_id: midFpt.id,
      lesson_id: 'fpt-m2-video',
      started_at: '2026-07-16T16:45:00.000Z',
      completed_at: null,
      last_position_seconds: 240,
      max_watched_seconds: 240,
      updated_at: '2026-07-16T16:49:00.000Z',
    },
  );
  mid.attempts.push(attempt(midFpt.id, mid.learner.id, quizzes[0], 1, 8));

  const failed = snapshots['quiz-failed-on-3'];
  const failedFpt = failed.enrollments[0];
  failed.progress.push(
    ...completedProgress(
      failedFpt.id,
      failed.learner.id,
      lessons.filter((lesson) => ['fpt-m1', 'fpt-m2', 'fpt-m3'].includes(lesson.module_id)),
    ),
  );
  failed.attempts.push(
    attempt(failedFpt.id, failed.learner.id, quizzes[0], 1, 8),
    attempt(failedFpt.id, failed.learner.id, quizzes[1], 1, 7),
    attempt(failedFpt.id, failed.learner.id, quizzes[2], 1, 6),
  );

  const almost = snapshots['one-quiz-from-done'];
  const almostFpt = almost.enrollments[0];
  almost.progress.push(
    ...completedProgress(almostFpt.id, almost.learner.id, courseLessons('course-fpt')),
  );
  almost.attempts.push(
    ...courseQuizzes('course-fpt')
      .slice(0, 3)
      .map((quiz) => attempt(almostFpt.id, almost.learner.id, quiz, 1, 8)),
  );

  const fptDone = snapshots['fpt-completed'];
  const fptDoneEnrollment = fptDone.enrollments[0];
  const fptDoneRenewal = enrollment(fptDone.learner, 'course-renewal-2026', true);
  fptDone.enrollments.push(fptDoneRenewal);
  fptDone.progress.push(
    ...completedProgress(fptDoneEnrollment.id, fptDone.learner.id, courseLessons('course-fpt')),
  );
  fptDone.attempts.push(
    ...courseQuizzes('course-fpt').map((quiz) =>
      attempt(fptDoneEnrollment.id, fptDone.learner.id, quiz, 1, 9),
    ),
  );
  fptDone.completions.push(
    completion(fptDoneEnrollment.id, fptDone.learner.id, 'course-fpt'),
  );

  const complete = snapshots['fully-complete'];
  const completeFpt = complete.enrollments[0];
  const completeBonus = complete.enrollments[1];
  const completeRenewal = enrollment(complete.learner, 'course-renewal-2026', true);
  complete.enrollments.push(completeRenewal);
  complete.progress.push(
    ...completedProgress(completeFpt.id, complete.learner.id, courseLessons('course-fpt')),
    ...completedProgress(completeBonus.id, complete.learner.id, courseLessons('course-bonus')),
    ...completedProgress(
      completeRenewal.id,
      complete.learner.id,
      courseLessons('course-renewal-2026'),
    ),
  );
  complete.attempts.push(
    ...courseQuizzes('course-fpt').map((quiz) =>
      attempt(completeFpt.id, complete.learner.id, quiz, 1, 10),
    ),
    ...courseQuizzes('course-renewal-2026').map((quiz) =>
      attempt(completeRenewal.id, complete.learner.id, quiz, 1, 8),
    ),
  );
  complete.completions.push(
    completion(completeFpt.id, complete.learner.id, 'course-fpt'),
    completion(completeBonus.id, complete.learner.id, 'course-bonus'),
    completion(completeRenewal.id, complete.learner.id, 'course-renewal-2026'),
  );

  return snapshots;
}

const snapshots = buildSnapshots();

function clone<T>(value: T): T {
  return structuredClone(value);
}

function progressTarget(learnerId: LearnerStateKey, lessonId: string) {
  const snapshot = snapshots[learnerId];
  const lesson = lessons.find((item) => item.id === lessonId);
  const module = modules.find((item) => item.id === lesson?.module_id);
  const enrollment = snapshot.enrollments.find(
    (item) => item.course_id === module?.course_id,
  );
  if (!lesson || !module || !enrollment) {
    throw new Error('Synthetic lesson progress target not found.');
  }
  return { snapshot, lesson, enrollment };
}

function upsertMockProgress(
  learnerId: LearnerStateKey,
  lessonId: string,
  mutate: (current: LmsLessonProgress | undefined) => LmsLessonProgress,
) {
  const { snapshot } = progressTarget(learnerId, lessonId);
  const index = snapshot.progress.findIndex(
    (item) => item.lesson_id === lessonId,
  );
  const next = mutate(index >= 0 ? snapshot.progress[index] : undefined);
  if (index >= 0) snapshot.progress[index] = next;
  else snapshot.progress.push(next);
  return clone(next);
}

export const mockProvider: LmsProvider = {
  async listLearners() {
    return clone(learnerSummaries);
  },
  async getCatalog() {
    return clone(mockCatalog);
  },
  async getLearnerSnapshot(learnerId) {
    return clone(snapshots[learnerId]);
  },
  async getModuleView(courseSlug, position) {
    const course = courses.find((item) => item.slug === courseSlug);
    if (!course) return null;
    const courseModules = modules.filter((item) => item.course_id === course.id);
    const module = courseModules.find((item) => item.position === position);
    if (!module) return null;
    const moduleLessonIds = new Set(
      lessons.filter((lesson) => lesson.module_id === module.id).map((lesson) => lesson.id),
    );
    return clone({
      course,
      module,
      modules: courseModules,
      lessons: lessons.filter((lesson) => moduleLessonIds.has(lesson.id)),
      resources: resources.filter((resource) => moduleLessonIds.has(resource.lesson_id)),
      quiz: quizzes.find((quiz) => quiz.module_id === module.id) ?? null,
    });
  },
  async getLessonView(lessonId) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return null;
    const module = modules.find((item) => item.id === lesson.module_id);
    const course = module && courses.find((item) => item.id === module.course_id);
    if (!module || !course) return null;
    return clone({
      course,
      module,
      lesson,
      moduleLessons: lessons.filter((item) => item.module_id === module.id),
      resources: resources.filter((resource) => resource.lesson_id === lesson.id),
    });
  },
  async acceptTerms(enrollmentId) {
    for (const snapshot of Object.values(snapshots)) {
      const record = snapshot.enrollments.find((item) => item.id === enrollmentId);
      if (record) {
        record.terms_accepted_at = new Date().toISOString();
        return clone(record);
      }
    }
    throw new Error('Synthetic enrollment not found.');
  },
  async updateProfile(profile: LmsLearnerProfile) {
    const snapshot = Object.values(snapshots).find(
      (item) => item.profile.auth_user_id === profile.auth_user_id,
    );
    if (!snapshot) throw new Error('Synthetic learner not found.');
    snapshot.profile = { ...profile, updated_at: new Date().toISOString() };
    return clone(snapshot.profile);
  },
  async getPlaybackToken(lessonId, learnerId) {
    const { snapshot, enrollment } = progressTarget(learnerId, lessonId);
    const progress = snapshot.progress.find(
      (item) =>
        item.enrollment_id === enrollment.id && item.lesson_id === lessonId,
    );
    return {
      url: 'data:video/mp4;base64,',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      max_watched_seconds: progress?.max_watched_seconds ?? 0,
    };
  },
  async recordHeartbeat(lessonId, positionSeconds, learnerId) {
    const { lesson, enrollment } = progressTarget(learnerId, lessonId);
    if (lesson.kind !== 'video' || !lesson.duration_seconds) {
      throw new Error('Synthetic heartbeat target is not a video.');
    }
    const now = new Date().toISOString();
    const position = Math.min(
      lesson.duration_seconds,
      Math.max(0, Math.floor(positionSeconds)),
    );
    return upsertMockProgress(learnerId, lessonId, (current) => {
      const maxWatched = Math.max(current?.max_watched_seconds ?? 0, position);
      return {
        id: current?.id ?? `${learnerId}-progress-${lessonId}`,
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        started_at: current?.started_at ?? now,
        completed_at:
          current?.completed_at ??
          (maxWatched >= lesson.duration_seconds! * 0.95 ? now : null),
        last_position_seconds: position,
        max_watched_seconds: maxWatched,
        updated_at: now,
      };
    });
  },
  async completeReading(lessonId, learnerId) {
    const { lesson, enrollment } = progressTarget(learnerId, lessonId);
    if (lesson.kind !== 'reading') {
      throw new Error('Synthetic completion target is not a reading.');
    }
    const now = new Date().toISOString();
    return upsertMockProgress(learnerId, lessonId, (current) => ({
      id: current?.id ?? `${learnerId}-progress-${lessonId}`,
      enrollment_id: enrollment.id,
      lesson_id: lessonId,
      started_at: current?.started_at ?? now,
      completed_at: current?.completed_at ?? now,
      last_position_seconds: current?.last_position_seconds ?? 0,
      max_watched_seconds: current?.max_watched_seconds ?? 0,
      updated_at: now,
    }));
  },
};
