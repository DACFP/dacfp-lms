import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  courseComplete,
  courseUnlocked,
  moduleUnlocked,
  termsGateSatisfied,
  type ProgressionContext,
} from './progression.ts';

const DENIED_BODY = { error: 'Lesson is unavailable.' };
const REJECTED_BODY = { error: 'Progress update rejected.' };
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AccessContext {
  enrollmentId: string;
  lesson: {
    id: string;
    module_id: string;
    kind: 'video' | 'reading';
    duration_seconds: number | null;
    is_required: boolean;
  };
  context: ProgressionContext;
}

class AccessDenied extends Error {}
class ProgressRejected extends Error {}

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

async function requireLessonAccess(
  admin: SupabaseClient,
  userId: string,
  lessonId: string,
): Promise<AccessContext> {
  const { data: lesson, error: lessonError } = await admin
    .from('lms_lessons')
    .select('id,module_id,kind,duration_seconds,is_required')
    .eq('id', lessonId)
    .maybeSingle();
  assertQuery(lessonError);
  if (!lesson) throw new AccessDenied();

  const { data: module, error: moduleError } = await admin
    .from('lms_modules')
    .select('id,course_id,position')
    .eq('id', lesson.module_id)
    .maybeSingle();
  assertQuery(moduleError);
  if (!module) throw new AccessDenied();

  const { data: course, error: courseError } = await admin
    .from('lms_courses')
    .select('id,status,progression,prerequisite_course_id,requires_terms_acceptance')
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
  if (enrollment.expires_at && new Date(enrollment.expires_at).getTime() <= Date.now()) {
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
  const [lessonsResult, quizzesResult, progressResult, attemptsResult] =
    await Promise.all([
      moduleIds.length
        ? admin
            .from('lms_lessons')
            .select('id,module_id,kind,duration_seconds,is_required')
            .in('module_id', moduleIds)
        : Promise.resolve({ data: [], error: null }),
      moduleIds.length
        ? admin.from('lms_module_quizzes').select('id,module_id').in('module_id', moduleIds)
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
  if (!moduleUnlocked(context)) throw new AccessDenied();

  return { enrollmentId: enrollment.id, lesson, context };
}

async function detectCompletion(
  admin: SupabaseClient,
  access: AccessContext,
  progressRow: { lesson_id: string; completed_at: string | null; max_watched_seconds: number },
) {
  const progress = [
    ...access.context.progress.filter((item) => item.lesson_id !== progressRow.lesson_id),
    progressRow,
  ];
  if (!courseComplete(
    access.context.course,
    access.context.modules,
    access.context.lessons,
    access.context.quizzes,
    progress,
    access.context.attempts,
  )) {
    return false;
  }

  const { data, error } = await admin
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
  if (error?.code !== '23505') assertQuery(error);
  return Boolean(data);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';
    const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
    if (!lessonId) throw new AccessDenied();

    const admin = serviceClient();
    const userId = await callerId(req, admin);
    const access = await requireLessonAccess(admin, userId, lessonId);

    if (action === 'heartbeat') {
      if (
        access.lesson.kind !== 'video' ||
        !Number.isFinite(body.position_seconds) ||
        body.position_seconds < 0
      ) {
        throw new ProgressRejected();
      }
      const { data, error } = await admin.rpc('lms_record_video_heartbeat', {
        p_enrollment_id: access.enrollmentId,
        p_lesson_id: access.lesson.id,
        p_position_seconds: Math.floor(body.position_seconds),
      });
      if (error?.code === '22023') throw new ProgressRejected();
      assertQuery(error);
      const previous = access.context.progress.find(
        (item) => item.lesson_id === access.lesson.id,
      );
      const completionFired = !previous?.completed_at && data.completed_at
        ? await detectCompletion(admin, access, data)
        : false;
      return jsonResponse(200, { progress: data, completion_fired: completionFired });
    }

    if (action === 'complete_reading') {
      if (access.lesson.kind !== 'reading') throw new ProgressRejected();
      const { data, error } = await admin.rpc('lms_complete_reading', {
        p_enrollment_id: access.enrollmentId,
        p_lesson_id: access.lesson.id,
      });
      if (error?.code === '22023') throw new ProgressRejected();
      assertQuery(error);
      const completionFired = await detectCompletion(admin, access, data);
      return jsonResponse(200, { progress: data, completion_fired: completionFired });
    }

    throw new ProgressRejected();
  } catch (error) {
    if (error instanceof AccessDenied) return jsonResponse(403, DENIED_BODY);
    if (error instanceof ProgressRejected) return jsonResponse(422, REJECTED_BODY);
    console.error('lms-progress failed', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse(500, { error: 'Progress is temporarily unavailable.' });
  }
});
