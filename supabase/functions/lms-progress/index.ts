import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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
    kind: 'video' | 'reading';
    duration_seconds: number | null;
  };
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
    .select('id,module_id,kind,duration_seconds')
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
  if (course.requires_terms_acceptance && !enrollment.terms_accepted_at) {
    throw new AccessDenied();
  }

  if (course.prerequisite_course_id) {
    const { data: prerequisiteEnrollment, error: prerequisiteError } =
      await admin
        .from('lms_enrollments')
        .select('id')
        .eq('auth_user_id', userId)
        .eq('course_id', course.prerequisite_course_id)
        .maybeSingle();
    assertQuery(prerequisiteError);
    if (!prerequisiteEnrollment) throw new AccessDenied();

    const { data: completion, error: completionError } = await admin
      .from('lms_completion_events')
      .select('id')
      .eq('enrollment_id', prerequisiteEnrollment.id)
      .limit(1)
      .maybeSingle();
    assertQuery(completionError);
    if (!completion) throw new AccessDenied();
  }

  if (course.progression === 'sequential' && module.position > 1) {
    const { data: previousModule, error: previousModuleError } = await admin
      .from('lms_modules')
      .select('id')
      .eq('course_id', course.id)
      .eq('position', module.position - 1)
      .maybeSingle();
    assertQuery(previousModuleError);
    if (!previousModule) throw new AccessDenied();

    const { data: previousQuiz, error: previousQuizError } = await admin
      .from('lms_module_quizzes')
      .select('id')
      .eq('module_id', previousModule.id)
      .maybeSingle();
    assertQuery(previousQuizError);

    if (previousQuiz) {
      const { data: passedAttempt, error: attemptError } = await admin
        .from('lms_quiz_attempts')
        .select('id')
        .eq('enrollment_id', enrollment.id)
        .eq('quiz_id', previousQuiz.id)
        .eq('passed', true)
        .limit(1)
        .maybeSingle();
      assertQuery(attemptError);
      if (!passedAttempt) throw new AccessDenied();
    } else {
      const { data: requiredLessons, error: requiredLessonsError } = await admin
        .from('lms_lessons')
        .select('id,kind,duration_seconds')
        .eq('module_id', previousModule.id)
        .eq('is_required', true);
      assertQuery(requiredLessonsError);

      const requiredIds = (requiredLessons ?? []).map((item) => item.id);
      const { data: progressRows, error: progressError } = requiredIds.length
        ? await admin
            .from('lms_lesson_progress')
            .select('lesson_id,completed_at,max_watched_seconds')
            .eq('enrollment_id', enrollment.id)
            .in('lesson_id', requiredIds)
        : { data: [], error: null };
      assertQuery(progressError);

      const progressByLesson = new Map(
        (progressRows ?? []).map((item) => [item.lesson_id, item]),
      );
      const complete = (requiredLessons ?? []).every((requiredLesson) => {
        const progress = progressByLesson.get(requiredLesson.id);
        if (!progress) return false;
        if (requiredLesson.kind === 'reading') return Boolean(progress.completed_at);
        return (
          Boolean(requiredLesson.duration_seconds) &&
          progress.max_watched_seconds >=
            Number(requiredLesson.duration_seconds) * 0.95
        );
      });
      if (!complete) throw new AccessDenied();
    }
  }

  return {
    enrollmentId: enrollment.id,
    lesson: {
      id: lesson.id,
      kind: lesson.kind,
      duration_seconds: lesson.duration_seconds,
    },
  };
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
    const action = typeof body.action === 'string' ? body.action : '';
    const lessonId =
      typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
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
      return jsonResponse(200, { progress: data });
    }

    if (action === 'complete_reading') {
      if (access.lesson.kind !== 'reading') throw new ProgressRejected();

      const { data, error } = await admin.rpc('lms_complete_reading', {
        p_enrollment_id: access.enrollmentId,
        p_lesson_id: access.lesson.id,
      });
      if (error?.code === '22023') throw new ProgressRejected();
      assertQuery(error);
      return jsonResponse(200, { progress: data });
    }

    throw new ProgressRejected();
  } catch (error) {
    if (error instanceof AccessDenied) {
      return jsonResponse(403, DENIED_BODY);
    }
    if (error instanceof ProgressRejected) {
      return jsonResponse(422, REJECTED_BODY);
    }
    console.error(
      'lms-progress failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return jsonResponse(500, { error: 'Progress is temporarily unavailable.' });
  }
});
