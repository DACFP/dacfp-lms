import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { LmsDataError } from './provider';
import type {
  LmsAuthEvent,
  LmsAuthProvider,
  LmsAuthResult,
  LmsAuthSession,
  LmsAuthRole,
  LmsAdminProvider,
  LmsPlaybackToken,
  LmsProvider,
  LmsQuizAnswers,
  LmsQuizGradeResult,
  LmsQuizPayload,
  LmsResourceToken,
  LmsSurveySubmitResult,
} from './provider';
import type {
  Catalog,
  CompletionEvidence,
  LearnerSnapshot,
  LearnerStateKey,
  LearnerSummary,
  LmsCompletionEvent,
  LmsCeReportingStatus,
  LmsCourse,
  LmsEnrollment,
  LmsEnrollmentCourseSummary,
  LmsLearnerProfile,
  LmsLesson,
  LmsLessonProgress,
  LmsLessonResource,
  LmsModule,
  LmsModuleQuiz,
  LmsQuizAttempt,
  LmsSurveyQuestion,
  LmsSurveyResponse,
  LmsSurveySection,
} from './types';
import { profileDisplayName } from '../lib/profile';

export const GENERIC_LOGIN_ERROR =
  'Unable to sign in. Check your credentials and try again.';
export const GENERIC_RESET_RESPONSE =
  'If an account exists, reset instructions will be sent.';
export const GENERIC_RESET_ERROR =
  'Unable to request reset instructions. Check your connection and try again.';
export const GENERIC_SIGNUP_ERROR =
  'Unable to create the account. Check your details and try again.';
export const GENERIC_PASSWORD_ERROR =
  'Unable to update the password. Request a new reset link and try again.';

let client: SupabaseClient | null = null;

function dataError(error: unknown, message: string) {
  const candidate = error as {
    code?: string;
    status?: number;
    context?: { status?: number };
  } | null;
  const status = candidate?.status ?? candidate?.context?.status;
  const denied =
    status === 401 ||
    status === 403 ||
    candidate?.code === '42501' ||
    candidate?.code === 'PGRST301';
  return new LmsDataError(denied ? 'denied' : 'unavailable', message);
}

async function functionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.clone !== 'function') return fallback;
  try {
    const body = await context.clone().json() as { error?: unknown };
    return typeof body.error === 'string' && body.error.trim()
      ? body.error
      : fallback;
  } catch {
    return fallback;
  }
}

function getClient() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new LmsDataError(
      'unavailable',
      'Sandbox authentication is not configured.',
    );
  }

  client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

function toRole(value: unknown): LmsAuthRole {
  return value === 'learner' || value === 'operator' ? value : null;
}

function toSession(session: Session | null): LmsAuthSession | null {
  if (!session) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      displayName:
        typeof session.user.user_metadata.display_name === 'string'
          ? session.user.user_metadata.display_name
          : profileDisplayName(
              typeof session.user.user_metadata.first_name === 'string'
                ? session.user.user_metadata.first_name
                : '',
              typeof session.user.user_metadata.last_name === 'string'
                ? session.user.user_metadata.last_name
                : '',
            ),
      role: toRole(session.user.app_metadata.lms_role),
    },
  };
}

function result(
  ok: boolean,
  message: string,
  session: Session | null = null,
): LmsAuthResult {
  return { ok, message, session: toSession(session) };
}

const learnerMetadata: Record<
  string,
  Pick<LearnerSummary, 'id' | 'label' | 'description'>
> = {
  'fresh@example.test': {
    id: 'fresh',
    label: 'Fresh learner',
    description: 'Terms not yet accepted',
  },
  'near-expiry@example.test': {
    id: 'near-expiry',
    label: 'Near Expiry',
    description: 'Renewal window open',
  },
  'midmodule@example.test': {
    id: 'mid-module-2',
    label: 'Mid-module 2',
    description: 'Resuming required content',
  },
  'failedquiz@example.test': {
    id: 'quiz-failed-on-3',
    label: 'Quiz failed on 3',
    description: 'Retake is available',
  },
  'almostdone@example.test': {
    id: 'one-quiz-from-done',
    label: 'One quiz from done',
    description: 'Final FPT quiz remains',
  },
  'fptcomplete@example.test': {
    id: 'fpt-completed',
    label: 'FPT completed',
    description: 'Bonus unlocked; renewal enrolled',
  },
  'complete@example.test': {
    id: 'fully-complete',
    label: 'Fully complete',
    description: 'FPT, bonus, and renewal complete',
  },
};

export function learnerSummaryForEmail(
  email: string,
  displayName: string,
): LearnerSummary {
  const normalizedEmail = email.trim().toLowerCase();
  const metadata = learnerMetadata[normalizedEmail];
  if (metadata) return { ...metadata, email: normalizedEmail };
  return {
    id: 'fresh',
    label: displayName || normalizedEmail,
    description: 'Authenticated learner',
    email: normalizedEmail,
  };
}

interface SnapshotRows {
  email: string;
  profile: Omit<LmsLearnerProfile, 'email'>;
  enrollments: LmsEnrollment[];
  progress: LmsLessonProgress[];
  attempts: LmsQuizAttempt[];
  surveyResponses: LmsSurveyResponse[];
  completions: LmsCompletionEvent[];
  ceReportingStatuses?: LmsCeReportingStatus[];
}

interface EnrollmentCourseSummaryRow {
  enrollment_id: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  course_status: string;
  prerequisite_course_id: string | null;
  module_positions: number[];
  lesson_ids: string[];
  quiz_module_ids: string[];
}

function toCourseStatus(value: string): LmsEnrollmentCourseSummary['status'] {
  return value === 'draft' || value === 'published' || value === 'archived'
    ? value
    : 'archived';
}

export function attachEnrollmentCourseSummaries(
  enrollments: LmsEnrollment[],
  rows: EnrollmentCourseSummaryRow[],
): LmsEnrollment[] {
  const summaryByEnrollment = new Map(
    rows.map((row) => [row.enrollment_id, row]),
  );
  return enrollments.map((enrollment) => {
    const row = summaryByEnrollment.get(enrollment.id);
    if (!row || row.course_id !== enrollment.course_id) return enrollment;
    return {
      ...enrollment,
      course_summary: {
        course_id: row.course_id,
        slug: row.course_slug,
        title: row.course_title,
        status: toCourseStatus(row.course_status),
        prerequisite_course_id: row.prerequisite_course_id,
        module_positions: row.module_positions,
        lesson_ids: row.lesson_ids,
        quiz_module_ids: row.quiz_module_ids,
      },
    };
  });
}

export function buildLearnerSnapshot(rows: SnapshotRows): LearnerSnapshot {
  const learner = learnerSummaryForEmail(rows.email, rows.profile.display_name);
  const courseByEnrollment = new Map(
    rows.enrollments.map((enrollment) => [enrollment.id, enrollment.course_id]),
  );
  const completions = rows.completions.flatMap<CompletionEvidence>((completion) => {
    const courseId = courseByEnrollment.get(completion.enrollment_id);
    return courseId ? [{ ...completion, course_id: courseId }] : [];
  });

  return {
    learner,
    profile: { ...rows.profile, email: rows.email },
    enrollments: rows.enrollments,
    progress: rows.progress,
    attempts: rows.attempts,
    surveyResponses: rows.surveyResponses,
    completions,
    ceReportingStatuses: rows.ceReportingStatuses ?? [],
  };
}

export function quizQuestionsContainCorrectKey(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(
    (question) =>
      question !== null &&
      typeof question === 'object' &&
      Object.prototype.hasOwnProperty.call(question, 'correct'),
  );
}

export function quizQuestionsHaveValidSelectionKind(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(
    (question) =>
      question !== null &&
      typeof question === 'object' &&
      ('select_kind' in question) &&
      (question.select_kind === 'single' || question.select_kind === 'multi'),
  );
}

async function currentUser() {
  const { data, error } = await getClient().auth.getSession();
  if (error || !data.session?.user) {
    throw new LmsDataError('denied', 'An authenticated session is required.');
  }
  return data.session.user;
}

async function tableRows<T>(table: string, orderColumns: string[] = []) {
  let query = getClient().from(table).select('*');
  for (const column of orderColumns) query = query.order(column);
  const { data, error } = await query;
  if (error) throw dataError(error, `Unable to load ${table}.`);
  return (data ?? []) as T[];
}

function progressFromPayload(value: unknown): LmsLessonProgress {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') {
    throw new LmsDataError('unavailable', 'Progress response was invalid.');
  }
  return candidate as LmsLessonProgress;
}

const contentProvider: LmsProvider = {
  async getCatalog() {
    const [courses, modules, lessons, resources, quizzes, surveySections, surveyQuestions] = await Promise.all([
      tableRows<LmsCourse>('lms_courses', ['created_at']),
      tableRows<LmsModule>('lms_modules', ['course_id', 'position']),
      tableRows<LmsLesson>('lms_lessons', ['module_id', 'position']),
      tableRows<LmsLessonResource>('lms_lesson_resources', [
        'lesson_id',
        'position',
      ]),
      tableRows<LmsModuleQuiz>('lms_module_quizzes', ['module_id']),
      tableRows<LmsSurveySection>('lms_survey_sections', [
        'lesson_id',
        'position',
      ]),
      tableRows<LmsSurveyQuestion>('lms_survey_questions', [
        'section_id',
        'position',
      ]),
    ]);
    return { courses, modules, lessons, resources, quizzes, surveySections, surveyQuestions };
  },

  async getLearnerSnapshot(_learnerId: LearnerStateKey) {
    const user = await currentUser();
    const [
      profileResult,
      enrollmentResult,
      ceReportingStatus,
      enrollmentCourseSummaryResult,
    ] = await Promise.all([
      getClient()
        .from('lms_learner_profiles')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle(),
      getClient()
        .from('lms_enrollments')
        .select('*')
        .eq('auth_user_id', user.id)
        .order('enrolled_at'),
      getClient().rpc('lms_ce_reporting_status'),
      getClient().rpc('lms_enrollment_course_summaries'),
    ]);
    if (profileResult.error || !profileResult.data) {
      throw dataError(profileResult.error, 'Learner profile not found.');
    }
    if (enrollmentResult.error) {
      throw dataError(enrollmentResult.error, 'Unable to load learner enrollments.');
    }
    if (ceReportingStatus.error) {
      throw dataError(ceReportingStatus.error, 'Unable to load CE reporting status.');
    }
    if (enrollmentCourseSummaryResult.error) {
      throw dataError(
        enrollmentCourseSummaryResult.error,
        'Unable to load expired enrollment course identity.',
      );
    }
    const enrollments = attachEnrollmentCourseSummaries(
      (enrollmentResult.data ?? []) as LmsEnrollment[],
      (enrollmentCourseSummaryResult.data ?? []) as EnrollmentCourseSummaryRow[],
    );
    const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
    const [progressResult, attemptsResult, surveyResponsesResult, completionsResult] =
      enrollmentIds.length
        ? await Promise.all([
            getClient()
              .from('lms_lesson_progress')
              .select('*')
              .in('enrollment_id', enrollmentIds)
              .order('updated_at'),
            getClient()
              .from('lms_quiz_attempts')
              .select('*')
              .in('enrollment_id', enrollmentIds)
              .order('quiz_id')
              .order('attempt_number'),
            getClient()
              .from('lms_survey_responses')
              .select('*')
              .in('enrollment_id', enrollmentIds)
              .order('submitted_at'),
            getClient()
              .from('lms_completion_events')
              .select('*')
              .in('enrollment_id', enrollmentIds)
              .order('completed_at'),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
    for (const result of [
      progressResult,
      attemptsResult,
      surveyResponsesResult,
      completionsResult,
    ]) {
      if (result.error) {
        throw dataError(result.error, 'Unable to load learner progress.');
      }
    }
    return buildLearnerSnapshot({
      email: user.email ?? '',
      profile: profileResult.data as Omit<LmsLearnerProfile, 'email'>,
      enrollments,
      progress: (progressResult.data ?? []) as LmsLessonProgress[],
      attempts: (attemptsResult.data ?? []) as LmsQuizAttempt[],
      surveyResponses: (surveyResponsesResult.data ?? []) as LmsSurveyResponse[],
      completions: (completionsResult.data ?? []) as LmsCompletionEvent[],
      ceReportingStatuses: (ceReportingStatus.data ?? []) as LmsCeReportingStatus[],
    });
  },

  async getModuleView(courseSlug, position) {
    const { data: course, error: courseError } = await getClient()
      .from('lms_courses')
      .select('*')
      .eq('slug', courseSlug)
      .maybeSingle();
    if (courseError) throw dataError(courseError, 'Unable to load this course.');
    if (!course) return null;
    const { data: modules, error: modulesError } = await getClient()
      .from('lms_modules')
      .select('*')
      .eq('course_id', course.id)
      .order('position');
    if (modulesError) throw dataError(modulesError, 'Unable to load this course.');
    const module = (modules ?? []).find((item) => item.position === position);
    if (!module) return null;
    const [{ data: lessons, error: lessonsError }, { data: quiz, error: quizError }] =
      await Promise.all([
        getClient()
          .from('lms_lessons')
          .select('*')
          .eq('module_id', module.id)
          .order('position'),
        getClient()
          .from('lms_module_quizzes')
          .select('*')
          .eq('module_id', module.id)
          .maybeSingle(),
      ]);
    if (lessonsError) throw dataError(lessonsError, 'Unable to load this module.');
    if (quizError) throw dataError(quizError, 'Unable to load this module.');
    const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
    const { data: resources, error: resourcesError } = lessonIds.length
      ? await getClient()
          .from('lms_lesson_resources')
          .select('*')
          .in('lesson_id', lessonIds)
          .order('lesson_id')
          .order('position')
      : { data: [], error: null };
    if (resourcesError) throw dataError(resourcesError, 'Unable to load module resources.');
    return {
      course: course as LmsCourse,
      module: module as LmsModule,
      modules: (modules ?? []) as LmsModule[],
      lessons: (lessons ?? []) as LmsLesson[],
      resources: (resources ?? []) as LmsLessonResource[],
      quiz: quiz as LmsModuleQuiz | null,
    };
  },

  async getLessonView(lessonId) {
    const { data: lesson, error: lessonError } = await getClient()
      .from('lms_lessons')
      .select('*')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonError) throw dataError(lessonError, 'Unable to load this lesson.');
    if (!lesson) return null;
    const { data: module, error: moduleError } = await getClient()
      .from('lms_modules')
      .select('*')
      .eq('id', lesson.module_id)
      .maybeSingle();
    if (moduleError) throw dataError(moduleError, 'Unable to load this lesson.');
    if (!module) return null;
    const { data: course, error: courseError } = await getClient()
      .from('lms_courses')
      .select('*')
      .eq('id', module.course_id)
      .maybeSingle();
    if (courseError) throw dataError(courseError, 'Unable to load this lesson.');
    if (!course) return null;
    const [
      { data: moduleLessons, error: moduleLessonsError },
      { data: resources, error: resourcesError },
    ] = await Promise.all([
      getClient()
        .from('lms_lessons')
        .select('*')
        .eq('module_id', module.id)
        .order('position'),
      getClient()
        .from('lms_lesson_resources')
        .select('*')
        .eq('lesson_id', lesson.id)
        .order('position'),
    ]);
    if (moduleLessonsError) throw dataError(moduleLessonsError, 'Unable to load this lesson.');
    if (resourcesError) throw dataError(resourcesError, 'Unable to load lesson resources.');
    return {
      course: course as LmsCourse,
      module: module as LmsModule,
      lesson: lesson as LmsLesson,
      moduleLessons: (moduleLessons ?? []) as LmsLesson[],
      resources: (resources ?? []) as LmsLessonResource[],
    };
  },

  async acceptTerms(enrollmentId) {
    const { data: enrollment, error: enrollmentError } = await getClient()
      .from('lms_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .single();
    if (enrollmentError || !enrollment) {
      throw dataError(enrollmentError, 'Unable to accept course terms.');
    }
    const { data: acceptedAt, error: acceptError } = await getClient().rpc(
      'lms_accept_terms',
      { p_course_id: enrollment.course_id },
    );
    if (acceptError || typeof acceptedAt !== 'string') {
      throw dataError(acceptError, 'Unable to accept course terms.');
    }
    return {
      ...(enrollment as LmsEnrollment),
      terms_accepted_at: acceptedAt,
    };
  },

  async updateProfile(profile) {
    const { data, error } = await getClient()
      .from('lms_learner_profiles')
      .update({
        display_name: profile.display_name,
        first_name: profile.first_name,
        middle_name: profile.middle_name,
        last_name: profile.last_name,
        firm: profile.firm,
        job_title: profile.job_title,
        phone: profile.phone,
        firm_url: profile.firm_url,
        address: profile.address,
        credential_ids: profile.credential_ids,
      })
      .eq('auth_user_id', profile.auth_user_id)
      .select('*')
      .single();
    if (error || !data) {
      throw dataError(error, 'Unable to update learner profile.');
    }
    return { ...(data as Omit<LmsLearnerProfile, 'email'>), email: profile.email };
  },

  async getPlaybackToken(lessonId) {
    const { data, error } = await getClient().functions.invoke(
      'lms-playback-token',
      { body: { lesson_id: lessonId } },
    );
    if (
      error ||
      !data ||
      typeof data.url !== 'string' ||
      typeof data.expires_at !== 'string' ||
      typeof data.max_watched_seconds !== 'number' ||
      typeof data.review_mode !== 'boolean'
    ) {
      throw dataError(error, 'Unable to start this lesson.');
    }
    return data as LmsPlaybackToken;
  },

  async getResourceToken(resourceId) {
    const { data, error } = await getClient().functions.invoke(
      'lms-resource-token',
      { body: { resource_id: resourceId } },
    );
    if (
      error ||
      !data ||
      typeof data.url !== 'string' ||
      typeof data.expires_at !== 'string' ||
      typeof data.title !== 'string'
    ) {
      throw dataError(error, 'Unable to download this resource.');
    }
    return data as LmsResourceToken;
  },

  async recordHeartbeat(lessonId, positionSeconds) {
    const { data, error } = await getClient().functions.invoke('lms-progress', {
      body: {
        action: 'heartbeat',
        lesson_id: lessonId,
        position_seconds: positionSeconds,
      },
    });
    if (error || !data) {
      throw dataError(error, 'Unable to save lesson progress.');
    }
    return progressFromPayload(data.progress);
  },

  async completeReading(lessonId) {
    const { data, error } = await getClient().functions.invoke('lms-progress', {
      body: { action: 'complete_reading', lesson_id: lessonId },
    });
    if (error || !data) {
      throw dataError(error, 'Unable to complete this reading.');
    }
    return progressFromPayload(data.progress);
  },

  async submitSurvey(lessonId, submission) {
    const { data, error } = await getClient().functions.invoke(
      'lms-submit-survey',
      { body: { lesson_id: lessonId, ...submission } },
    );
    if (
      error ||
      !data ||
      !data.response ||
      typeof data.response.id !== 'string' ||
      typeof data.completion_fired !== 'boolean' ||
      typeof data.already_submitted !== 'boolean'
    ) {
      throw dataError(error, 'Unable to submit this survey.');
    }
    return data as LmsSurveySubmitResult;
  },

  async getQuiz(quizId) {
    const { data, error } = await getClient().functions.invoke('lms-get-quiz', {
      body: { quiz_id: quizId },
    });
    if (
      error ||
      !data ||
      !data.quiz ||
      !Array.isArray(data.questions) ||
      quizQuestionsContainCorrectKey(data.questions) ||
      !quizQuestionsHaveValidSelectionKind(data.questions)
    ) {
      throw dataError(error, 'Unable to load this quiz.');
    }
    return data as LmsQuizPayload;
  },

  async gradeQuiz(quizId, answers: LmsQuizAnswers) {
    const { data, error } = await getClient().functions.invoke(
      'lms-grade-attempt',
      { body: { quiz_id: quizId, answers } },
    );
    if (
      error ||
      !data ||
      typeof data.attempt_number !== 'number' ||
      typeof data.score !== 'number' ||
      typeof data.possible_points !== 'number' ||
      typeof data.passed !== 'boolean' ||
      typeof data.completion_fired !== 'boolean'
    ) {
      throw dataError(error, 'Unable to grade this quiz.');
    }
    return data as LmsQuizGradeResult;
  },
};

export const supabaseProvider: LmsProvider & LmsAuthProvider & LmsAdminProvider = {
  ...contentProvider,
  async getSession() {
    try {
      const { data, error } = await getClient().auth.getSession();
      if (error) return null;
      return toSession(data.session);
    } catch {
      return null;
    }
  },

  onAuthStateChange(callback) {
    const {
      data: { subscription },
    } = getClient().auth.onAuthStateChange((event, session) => {
      callback(event as LmsAuthEvent, toSession(session));
    });
    return () => subscription.unsubscribe();
  },

  async signUp({ email, password, firstName, lastName, firm, jobTitle }) {
    try {
      const displayName = profileDisplayName(firstName, lastName);
      const { data, error } = await getClient().auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            lms_provisioned: 'true',
            display_name: displayName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            firm: firm.trim(),
            job_title: jobTitle.trim(),
          },
        },
      });
      if (error) return result(false, GENERIC_SIGNUP_ERROR);
      return result(
        true,
        data.session
          ? 'Account created. You are signed in.'
          : 'Account created. Check your email to confirm access.',
        data.session,
      );
    } catch {
      return result(false, GENERIC_SIGNUP_ERROR);
    }
  },

  async login(email, password) {
    try {
      const { data, error } = await getClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.session) return result(false, GENERIC_LOGIN_ERROR);
      return result(true, 'Signed in.', data.session);
    } catch {
      return result(false, GENERIC_LOGIN_ERROR);
    }
  },

  async logout() {
    try {
      await getClient().auth.signOut({ scope: 'global' });
    } catch {
      // Local session state is cleared by AuthSessionProvider regardless.
    }
  },

  async requestPasswordReset(email, redirectTo) {
    try {
      const { error } = await getClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });
      if (error) return result(false, GENERIC_RESET_ERROR);
    } catch {
      return result(false, GENERIC_RESET_ERROR);
    }
    return result(true, GENERIC_RESET_RESPONSE);
  },

  async updatePassword(password) {
    try {
      const { error } = await getClient().auth.updateUser({ password });
      if (error) return result(false, GENERIC_PASSWORD_ERROR);
      const { data: sessionData } = await getClient().auth.getSession();
      return result(true, 'Password updated.', sessionData.session);
    } catch {
      return result(false, GENERIC_PASSWORD_ERROR);
    }
  },

  async adminRequest<T>(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await getClient().functions.invoke('lms-admin', {
      body: { action, payload },
    });
    if (error) {
      throw dataError(
        error,
        await functionErrorMessage(error, 'Unable to complete this admin request.'),
      );
    }
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'data')) {
      throw dataError(null, 'Unable to complete this admin request.');
    }
    return data.data as T;
  },
};
