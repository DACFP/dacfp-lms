import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type {
  LmsAuthEvent,
  LmsAuthProvider,
  LmsAuthResult,
  LmsAuthSession,
  LmsAuthRole,
  LmsPlaybackToken,
  LmsProvider,
  LmsQuizAnswers,
  LmsQuizGradeResult,
  LmsQuizPayload,
} from './provider';
import type {
  Catalog,
  CompletionEvidence,
  LearnerSnapshot,
  LearnerStateKey,
  LearnerSummary,
  LmsCompletionEvent,
  LmsCourse,
  LmsEnrollment,
  LmsLearnerProfile,
  LmsLesson,
  LmsLessonProgress,
  LmsLessonResource,
  LmsModule,
  LmsModuleQuiz,
  LmsQuizAttempt,
} from './types';

export const GENERIC_LOGIN_ERROR =
  'Unable to sign in. Check your credentials and try again.';
export const GENERIC_RESET_RESPONSE =
  'If an account exists, reset instructions will be sent.';
export const GENERIC_SIGNUP_ERROR =
  'Unable to create the account. Check your details and try again.';
export const GENERIC_PASSWORD_ERROR =
  'Unable to update the password. Request a new reset link and try again.';

let client: SupabaseClient | null = null;

function getClient() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error('Sandbox authentication is not configured.');
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
          : '',
      role: toRole(session.user.app_metadata.role),
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
  completions: LmsCompletionEvent[];
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
    completions,
  };
}

async function currentUser() {
  const { data, error } = await getClient().auth.getSession();
  if (error || !data.session?.user) {
    throw new Error('An authenticated session is required.');
  }
  return data.session.user;
}

async function tableRows<T>(table: string, orderColumns: string[] = []) {
  let query = getClient().from(table).select('*');
  for (const column of orderColumns) query = query.order(column);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load ${table}.`);
  return (data ?? []) as T[];
}

function progressFromPayload(value: unknown): LmsLessonProgress {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Progress response was invalid.');
  }
  return candidate as LmsLessonProgress;
}

const contentProvider: LmsProvider = {
  async listLearners() {
    const user = await currentUser();
    const profiles = await tableRows<Omit<LmsLearnerProfile, 'email'>>(
      'lms_learner_profiles',
    );
    const profile = profiles.find((item) => item.auth_user_id === user.id);
    return [
      learnerSummaryForEmail(
        user.email ?? '',
        profile?.display_name ?? user.user_metadata.display_name ?? '',
      ),
    ];
  },

  async getCatalog() {
    const [courses, modules, lessons, resources, quizzes] = await Promise.all([
      tableRows<LmsCourse>('lms_courses', ['created_at']),
      tableRows<LmsModule>('lms_modules', ['course_id', 'position']),
      tableRows<LmsLesson>('lms_lessons', ['module_id', 'position']),
      tableRows<LmsLessonResource>('lms_lesson_resources', [
        'lesson_id',
        'position',
      ]),
      tableRows<LmsModuleQuiz>('lms_module_quizzes', ['module_id']),
    ]);
    return { courses, modules, lessons, resources, quizzes };
  },

  async getLearnerSnapshot(_learnerId: LearnerStateKey) {
    const user = await currentUser();
    const [profiles, enrollments, progress, attempts, completions] =
      await Promise.all([
        tableRows<Omit<LmsLearnerProfile, 'email'>>('lms_learner_profiles'),
        tableRows<LmsEnrollment>('lms_enrollments', ['enrolled_at']),
        tableRows<LmsLessonProgress>('lms_lesson_progress', ['updated_at']),
        tableRows<LmsQuizAttempt>('lms_quiz_attempts', [
          'quiz_id',
          'attempt_number',
        ]),
        tableRows<LmsCompletionEvent>('lms_completion_events', ['completed_at']),
      ]);
    const profile = profiles.find((item) => item.auth_user_id === user.id);
    if (!profile) throw new Error('Learner profile not found.');
    return buildLearnerSnapshot({
      email: user.email ?? '',
      profile,
      enrollments,
      progress,
      attempts,
      completions,
    });
  },

  async getModuleView(courseSlug, position) {
    const catalog = await this.getCatalog();
    const course = catalog.courses.find((item) => item.slug === courseSlug);
    if (!course) return null;
    const modules = catalog.modules.filter((item) => item.course_id === course.id);
    const module = modules.find((item) => item.position === position);
    if (!module) return null;
    const lessons = catalog.lessons.filter((item) => item.module_id === module.id);
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    return {
      course,
      module,
      modules,
      lessons,
      resources: catalog.resources.filter((item) => lessonIds.has(item.lesson_id)),
      quiz: catalog.quizzes.find((item) => item.module_id === module.id) ?? null,
    };
  },

  async getLessonView(lessonId) {
    const catalog = await this.getCatalog();
    const lesson = catalog.lessons.find((item) => item.id === lessonId);
    if (!lesson) return null;
    const module = catalog.modules.find((item) => item.id === lesson.module_id);
    const course = module
      ? catalog.courses.find((item) => item.id === module.course_id)
      : null;
    if (!module || !course) return null;
    return {
      course,
      module,
      lesson,
      moduleLessons: catalog.lessons.filter((item) => item.module_id === module.id),
      resources: catalog.resources.filter((item) => item.lesson_id === lesson.id),
    };
  },

  async acceptTerms(enrollmentId) {
    const termsAcceptedAt = new Date().toISOString();
    const { data, error } = await getClient()
      .from('lms_enrollments')
      .update({ terms_accepted_at: termsAcceptedAt })
      .eq('id', enrollmentId)
      .select('*')
      .single();
    if (error || !data) throw new Error('Unable to accept course terms.');
    return data as LmsEnrollment;
  },

  async updateProfile(profile) {
    const { data, error } = await getClient()
      .from('lms_learner_profiles')
      .update({
        display_name: profile.display_name,
        credential_ids: profile.credential_ids,
      })
      .eq('auth_user_id', profile.auth_user_id)
      .select('*')
      .single();
    if (error || !data) throw new Error('Unable to update learner profile.');
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
      typeof data.max_watched_seconds !== 'number'
    ) {
      throw new Error('Unable to start this lesson.');
    }
    return data as LmsPlaybackToken;
  },

  async recordHeartbeat(lessonId, positionSeconds) {
    const { data, error } = await getClient().functions.invoke('lms-progress', {
      body: {
        action: 'heartbeat',
        lesson_id: lessonId,
        position_seconds: positionSeconds,
      },
    });
    if (error || !data) throw new Error('Unable to save lesson progress.');
    return progressFromPayload(data.progress);
  },

  async completeReading(lessonId) {
    const { data, error } = await getClient().functions.invoke('lms-progress', {
      body: { action: 'complete_reading', lesson_id: lessonId },
    });
    if (error || !data) throw new Error('Unable to complete this reading.');
    return progressFromPayload(data.progress);
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
      JSON.stringify(data).includes('"correct"')
    ) {
      throw new Error('Unable to load this quiz.');
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
      throw new Error('Unable to grade this quiz.');
    }
    return data as LmsQuizGradeResult;
  },
};

export const supabaseProvider: LmsProvider & LmsAuthProvider = {
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

  async signUp({ email, password, displayName }) {
    try {
      const { data, error } = await getClient().auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { display_name: displayName.trim() } },
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
      await getClient().auth.signOut({ scope: 'local' });
    } catch {
      // Local session state is cleared by AuthSessionProvider regardless.
    }
  },

  async requestPasswordReset(email, redirectTo) {
    try {
      await getClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });
    } catch {
      // Deliberately indistinguishable from a successful reset request.
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
};
