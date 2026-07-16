import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  courseUnlocked,
  quizAttemptable,
  termsGateSatisfied,
  type ProgressionContext,
} from './progression.ts';

const DENIED_BODY = { error: 'Quiz is unavailable.' };
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface QuizAccess {
  quiz: {
    id: string;
    module_id: string;
    question_count: number;
    pass_pct: number;
  };
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

  return { quiz };
}

function shuffle<T>(input: T[]) {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const selected = random[0] % (index + 1);
    [output[index], output[selected]] = [output[selected], output[index]];
  }
  return output;
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
      .select('id,quiz_id,position,prompt,choices,points')
      .eq('quiz_id', access.quiz.id)
      .order('position');
    assertQuery(questionsError);
    if (!questions || questions.length !== access.quiz.question_count) {
      throw new Error('Quiz question count is invalid.');
    }

    const publicQuestions = shuffle(
      questions.map((question) => ({
        ...question,
        choices: shuffle(Array.isArray(question.choices) ? question.choices : []),
      })),
    );

    return jsonResponse(200, {
      quiz: {
        id: access.quiz.id,
        question_count: access.quiz.question_count,
        pass_pct: access.quiz.pass_pct,
      },
      questions: publicQuestions,
    });
  } catch (error) {
    if (error instanceof AccessDenied) {
      return jsonResponse(403, DENIED_BODY);
    }
    console.error(
      'lms-get-quiz failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return jsonResponse(500, { error: 'Quiz is temporarily unavailable.' });
  }
});
