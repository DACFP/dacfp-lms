import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  courseComplete,
  courseUnlocked,
  moduleUnlocked,
  termsGateSatisfied,
  type ProgressionContext,
} from './progression.ts';

const DENIED_BODY = { error: 'Survey access is unavailable.' };
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class AccessDenied extends Error {}
class InvalidSurvey extends Error {}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) throw new Error('Supabase runtime is unavailable.');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function callerId(req: Request, admin: SupabaseClient) {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new AccessDenied();
  const { data, error } = await admin.auth.getUser(
    authorization.slice('Bearer '.length),
  );
  if (error || !data.user) throw new AccessDenied();
  return data.user.id;
}

function assertQuery(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

type SurveyQuestion = {
  id: string;
  kind: 'scale_1_5' | 'text' | 'single_choice' | 'multi_choice';
  choices: Array<{ id: string; text: string }> | null;
  required: boolean;
};

function normalizeAnswers(
  input: unknown,
  questions: SurveyQuestion[],
): Record<string, number | string | string[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidSurvey('Answers must be an object.');
  }
  const supplied = input as Record<string, unknown>;
  const answers: Record<string, number | string | string[]> = {};

  for (const question of questions) {
    const value = supplied[question.id];
    if (question.kind === 'scale_1_5') {
      if (value === undefined && !question.required) continue;
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
        throw new InvalidSurvey('Complete every required survey question.');
      }
      answers[question.id] = Number(value);
      continue;
    }

    if (question.kind === 'text') {
      if ((value === undefined || value === '') && !question.required) continue;
      if (typeof value !== 'string' || !value.trim()) {
        throw new InvalidSurvey('Complete every required survey question.');
      }
      answers[question.id] = value.trim();
      continue;
    }

    const allowed = new Set((question.choices ?? []).map((choice) => choice.id));
    if (question.kind === 'single_choice') {
      if (value === undefined && !question.required) continue;
      if (typeof value !== 'string' || !allowed.has(value)) {
        throw new InvalidSurvey('Choose a valid survey response.');
      }
      answers[question.id] = value;
      continue;
    }

    if (value === undefined && !question.required) continue;
    if (
      !Array.isArray(value) ||
      (question.required && value.length === 0) ||
      value.some((choice) => typeof choice !== 'string' || !allowed.has(choice))
    ) {
      throw new InvalidSurvey('Choose a valid survey response.');
    }
    answers[question.id] = [...new Set(value as string[])];
  }

  return answers;
}

async function surveyAccess(
  admin: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  const { data: lesson, error: lessonError } = await admin
    .from('lms_lessons')
    .select('id,module_id,kind,duration_seconds,is_required')
    .eq('id', lessonId)
    .maybeSingle();
  assertQuery(lessonError);
  if (!lesson || lesson.kind !== 'survey') throw new AccessDenied();

  const { data: module, error: moduleError } = await admin
    .from('lms_modules')
    .select('id,course_id,position')
    .eq('id', lesson.module_id)
    .maybeSingle();
  assertQuery(moduleError);
  if (!module) throw new AccessDenied();

  const { data: course, error: courseError } = await admin
    .from('lms_courses')
    .select('id,progression,prerequisite_course_id,requires_terms_acceptance')
    .eq('id', module.course_id)
    .maybeSingle();
  assertQuery(courseError);
  if (!course) throw new AccessDenied();

  const { data: enrollment, error: enrollmentError } = await admin
    .from('lms_enrollments')
    .select('id,course_id,status,expires_at,terms_accepted_at')
    .eq('auth_user_id', userId)
    .eq('course_id', course.id)
    .maybeSingle();
  assertQuery(enrollmentError);
  if (
    !enrollment ||
    enrollment.status !== 'active' ||
    (enrollment.expires_at && new Date(enrollment.expires_at).getTime() <= Date.now())
  ) {
    throw new AccessDenied();
  }

  const { data: userEnrollments, error: userEnrollmentsError } = await admin
    .from('lms_enrollments')
    .select('id,course_id')
    .eq('auth_user_id', userId);
  assertQuery(userEnrollmentsError);
  const enrollmentIds = (userEnrollments ?? []).map((item) => item.id);
  const { data: completionRows, error: completionError } = enrollmentIds.length
    ? await admin
        .from('lms_completion_events')
        .select('enrollment_id')
        .in('enrollment_id', enrollmentIds)
    : { data: [], error: null };
  assertQuery(completionError);
  const courseByEnrollment = new Map(
    (userEnrollments ?? []).map((item) => [item.id, item.course_id]),
  );
  const completions = (completionRows ?? []).flatMap((item) => {
    const courseId = courseByEnrollment.get(item.enrollment_id);
    return courseId ? [{ course_id: courseId }] : [];
  });
  if (!courseUnlocked(course, completions) || !termsGateSatisfied(course, enrollment)) {
    throw new AccessDenied();
  }

  const { data: modules, error: modulesError } = await admin
    .from('lms_modules')
    .select('id,course_id,position')
    .eq('course_id', course.id);
  assertQuery(modulesError);
  const moduleIds = (modules ?? []).map((item) => item.id);
  const [lessons, quizzes, progress, attempts, surveyResponses] = await Promise.all([
    admin
      .from('lms_lessons')
      .select('id,module_id,kind,duration_seconds,is_required')
      .in('module_id', moduleIds),
    admin.from('lms_module_quizzes').select('id,module_id').in('module_id', moduleIds),
    admin
      .from('lms_lesson_progress')
      .select('lesson_id,completed_at,max_watched_seconds')
      .eq('enrollment_id', enrollment.id),
    admin
      .from('lms_quiz_attempts')
      .select('quiz_id,attempt_number,passed')
      .eq('enrollment_id', enrollment.id),
    admin
      .from('lms_survey_responses')
      .select('enrollment_id,lesson_id')
      .eq('enrollment_id', enrollment.id),
  ]);
  for (const result of [lessons, quizzes, progress, attempts, surveyResponses]) {
    assertQuery(result.error);
  }
  const context: ProgressionContext = {
    course,
    module,
    modules: modules ?? [],
    lessons: lessons.data ?? [],
    quizzes: quizzes.data ?? [],
    progress: progress.data ?? [],
    attempts: attempts.data ?? [],
    surveyResponses: surveyResponses.data ?? [],
  };
  if (!moduleUnlocked(context)) throw new AccessDenied();
  return { enrollment, lesson, context };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const body = await req.json().catch(() => ({}));
    const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
    if (!lessonId) throw new AccessDenied();
    const admin = serviceClient();
    const userId = await callerId(req, admin);
    const access = await surveyAccess(admin, userId, lessonId);

    const { data: existing, error: existingError } = await admin
      .from('lms_survey_responses')
      .select('*')
      .eq('enrollment_id', access.enrollment.id)
      .eq('lesson_id', lessonId)
      .maybeSingle();
    assertQuery(existingError);
    if (existing) {
      return jsonResponse(200, {
        response: existing,
        completion_fired: false,
        already_submitted: true,
      });
    }

    const { data: questions, error: questionsError } = await admin
      .from('lms_survey_questions')
      .select('id,kind,choices,required')
      .eq('lesson_id', lessonId)
      .order('position');
    assertQuery(questionsError);
    if (!questions?.length) throw new InvalidSurvey('Survey questions are unavailable.');
    const answers = normalizeAnswers(body.answers, questions as SurveyQuestion[]);

    const { data: response, error: responseError } = await admin
      .from('lms_survey_responses')
      .insert({
        enrollment_id: access.enrollment.id,
        lesson_id: lessonId,
        submitted_at: new Date().toISOString(),
        answers,
      })
      .select('*')
      .single();
    if (responseError?.code === '23505') {
      const { data: raced, error: racedError } = await admin
        .from('lms_survey_responses')
        .select('*')
        .eq('enrollment_id', access.enrollment.id)
        .eq('lesson_id', lessonId)
        .single();
      assertQuery(racedError);
      return jsonResponse(200, {
        response: raced,
        completion_fired: false,
        already_submitted: true,
      });
    }
    assertQuery(responseError);

    const complete = courseComplete(
      access.context.course,
      access.context.modules,
      access.context.lessons,
      access.context.quizzes,
      access.context.progress,
      access.context.attempts,
      [
        ...access.context.surveyResponses,
        { enrollment_id: access.enrollment.id, lesson_id: lessonId },
      ],
    );
    let completionFired = false;
    if (complete) {
      const { data: completion, error: completionError } = await admin
        .from('lms_completion_events')
        .insert({
          enrollment_id: access.enrollment.id,
          completed_at: new Date().toISOString(),
          trigger: 'all_requirements_met',
          processed_at: null,
          designation_issued: false,
        })
        .select('id')
        .single();
      if (completionError?.code !== '23505') assertQuery(completionError);
      completionFired = Boolean(completion);
    }

    return jsonResponse(200, {
      response,
      completion_fired: completionFired,
      already_submitted: false,
    });
  } catch (error) {
    if (error instanceof AccessDenied) return jsonResponse(403, DENIED_BODY);
    if (error instanceof InvalidSurvey) return jsonResponse(400, { error: error.message });
    console.error('lms-submit-survey failed', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse(500, { error: 'Survey submission could not be completed.' });
  }
});
