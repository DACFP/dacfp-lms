import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  courseComplete,
  courseUnlocked,
  meetsPassThreshold,
  quizAttemptable,
  termsGateSatisfied,
  type ProgressionContext,
} from './progression.ts';
import {
  InvalidQuizSubmission,
  normalizeAnswers,
  scoreAnswers,
} from './grading.ts';
import { insertWithAttemptNumberRetry } from './attempt-retry.ts';

const DENIED_BODY = { error: 'Quiz is unavailable.' };
const REJECTED_BODY = { error: 'Submission was rejected.' };
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface QuizAccess {
  enrollmentId: string;
  quiz: {
    id: string;
    module_id: string;
    question_count: number;
    pass_pct: number;
  };
  context: ProgressionContext;
}

class AccessDenied extends Error {}

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
  const token = authorization.slice('Bearer '.length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new AccessDenied();
  return data.user.id;
}

function assertQuery(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function requireQuizAccess(
  admin: SupabaseClient,
  userId: string,
  quizId: string,
): Promise<QuizAccess> {
  const { data: quiz, error: quizError } = await admin
    .from('lms_module_quizzes')
    .select('id,module_id,question_count,pass_pct')
    .eq('id', quizId)
    .maybeSingle();
  assertQuery(quizError);
  if (!quiz) throw new AccessDenied();

  const { data: module, error: moduleError } = await admin
    .from('lms_modules')
    .select('id,course_id,position')
    .eq('id', quiz.module_id)
    .maybeSingle();
  assertQuery(moduleError);
  if (!module) throw new AccessDenied();

  const { data: course, error: courseError } = await admin
    .from('lms_courses')
    .select(
      'id,status,progression,prerequisite_course_id,requires_terms_acceptance',
    )
    .eq('id', module.course_id)
    .maybeSingle();
  assertQuery(courseError);
  if (!course || course.status !== 'published') throw new AccessDenied();

  const { data: enrollment, error: enrollmentError } = await admin
    .from('lms_enrollments')
    .select('id,status,expires_at,terms_accepted_at')
    .eq('auth_user_id', userId)
    .eq('course_id', course.id)
    .maybeSingle();
  assertQuery(enrollmentError);
  if (!enrollment || enrollment.status !== 'active') throw new AccessDenied();
  if (
    enrollment.expires_at &&
    new Date(enrollment.expires_at).getTime() <= Date.now()
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

  if (
    !courseUnlocked(course, completions) ||
    !termsGateSatisfied(course, enrollment)
  ) {
    throw new AccessDenied();
  }

  const { data: modules, error: modulesError } = await admin
    .from('lms_modules')
    .select('id,course_id,position')
    .eq('course_id', course.id);
  assertQuery(modulesError);
  const moduleIds = (modules ?? []).map((item) => item.id);
  const [lessonsResult, quizzesResult, progressResult, attemptsResult] =
    await Promise.all([
      moduleIds.length
        ? admin
            .from('lms_lessons')
            .select('id,module_id,kind,duration_seconds,is_required')
            .in('module_id', moduleIds)
        : Promise.resolve({ data: [], error: null }),
      moduleIds.length
        ? admin
            .from('lms_module_quizzes')
            .select('id,module_id')
            .in('module_id', moduleIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from('lms_lesson_progress')
        .select('lesson_id,completed_at,max_watched_seconds')
        .eq('enrollment_id', enrollment.id),
      admin
        .from('lms_quiz_attempts')
        .select('quiz_id,attempt_number,passed')
        .eq('enrollment_id', enrollment.id),
    ]);
  assertQuery(lessonsResult.error);
  assertQuery(quizzesResult.error);
  assertQuery(progressResult.error);
  assertQuery(attemptsResult.error);

  const context: ProgressionContext = {
    course,
    module,
    modules: modules ?? [],
    lessons: lessonsResult.data ?? [],
    quizzes: quizzesResult.data ?? [],
    progress: progressResult.data ?? [],
    attempts: attemptsResult.data ?? [],
  };
  if (!quizAttemptable(context)) throw new AccessDenied();

  return { enrollmentId: enrollment.id, quiz, context };
}

async function insertAttempt(
  admin: SupabaseClient,
  access: QuizAccess,
  answers: Record<string, string[]>,
  score: number,
  passed: boolean,
) {
  return insertWithAttemptNumberRetry(
    access.quiz.id,
    access.context.attempts,
    async (attemptNumber) => {
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from('lms_quiz_attempts')
        .insert({
          enrollment_id: access.enrollmentId,
          quiz_id: access.quiz.id,
          attempt_number: attemptNumber,
          started_at: now,
          submitted_at: now,
          answers,
          score,
          passed,
        })
        .select('*')
        .single();
      return { data, error };
    },
    async () => {
      const { data, error } = await admin
        .from('lms_quiz_attempts')
        .select('quiz_id,attempt_number,passed')
        .eq('enrollment_id', access.enrollmentId);
      assertQuery(error);
      return data ?? [];
    },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quiz_id === 'string' ? body.quiz_id.trim() : '';
    if (!quizId) throw new AccessDenied();

    const admin = serviceClient();
    const userId = await callerId(req, admin);
    const access = await requireQuizAccess(admin, userId, quizId);
    const { data: questions, error: questionsError } = await admin
      .from('lms_quiz_questions')
      .select('id,correct,choices,points')
      .eq('quiz_id', access.quiz.id)
      .order('position');
    assertQuery(questionsError);
    if (!questions || questions.length !== access.quiz.question_count) {
      throw new Error('Quiz question count is invalid.');
    }

    const answers = normalizeAnswers(body.answers, questions);
    const { score, possiblePoints } = scoreAnswers(answers, questions);
    const passed = meetsPassThreshold(
      score,
      possiblePoints,
      access.quiz.pass_pct,
    );
    const attempt = await insertAttempt(
      admin,
      access,
      answers,
      score,
      passed,
    );

    const complete = courseComplete(
      access.context.course,
      access.context.modules,
      access.context.lessons,
      access.context.quizzes,
      access.context.progress,
      [
        ...access.context.attempts,
        {
          quiz_id: attempt.quiz_id,
          attempt_number: attempt.attempt_number,
          passed: attempt.passed,
        },
      ],
    );
    let completionFired = false;
    if (complete) {
      const { data: completion, error: completionError } = await admin
        .from('lms_completion_events')
        .insert({
          enrollment_id: access.enrollmentId,
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
      attempt_number: attempt.attempt_number,
      score,
      possible_points: possiblePoints,
      passed,
      completion_fired: completionFired,
    });
  } catch (error) {
    if (error instanceof AccessDenied) {
      return jsonResponse(403, DENIED_BODY);
    }
    if (error instanceof InvalidQuizSubmission) {
      return jsonResponse(422, REJECTED_BODY);
    }
    console.error(
      'lms-grade-attempt failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return jsonResponse(500, { error: 'Quiz grading is temporarily unavailable.' });
  }
});
