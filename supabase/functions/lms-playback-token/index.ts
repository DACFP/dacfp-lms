import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  PLACEHOLDER_MP4_BASE64,
  PLACEHOLDER_PATH,
} from './placeholder.ts';

const BUCKET = 'lms-video';
const SIGNED_URL_TTL_SECONDS = 30;
const DENIED_BODY = { error: 'Lesson is unavailable.' };
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
    video_ref: string | null;
    duration_seconds: number | null;
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

async function requireLessonAccess(
  admin: SupabaseClient,
  userId: string,
  lessonId: string,
): Promise<AccessContext> {
  const { data: lesson, error: lessonError } = await admin
    .from('lms_lessons')
    .select('id,module_id,kind,video_ref,duration_seconds')
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
      video_ref: lesson.video_ref,
      duration_seconds: lesson.duration_seconds,
    },
  };
}

function decodePlaceholder() {
  const binary = atob(PLACEHOLDER_MP4_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function ensurePlaceholderAsset(admin: SupabaseClient, path: string) {
  if (path !== PLACEHOLDER_PATH) return;
  const separator = path.lastIndexOf('/');
  const folder = path.slice(0, separator);
  const filename = path.slice(separator + 1);
  const { data: objects, error: listError } = await admin.storage
    .from(BUCKET)
    .list(folder, { limit: 1, search: filename });
  assertQuery(listError);
  if (objects?.some((item) => item.name === filename)) return;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, decodePlaceholder(), {
      cacheControl: '3600',
      contentType: 'video/mp4',
      upsert: true,
    });
  assertQuery(uploadError);
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
    const lessonId =
      typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
    if (!lessonId) throw new AccessDenied();

    const admin = serviceClient();
    const userId = await callerId(req, admin);
    const access = await requireLessonAccess(admin, userId, lessonId);
    if (
      access.lesson.kind !== 'video' ||
      !access.lesson.video_ref ||
      !access.lesson.duration_seconds
    ) {
      throw new AccessDenied();
    }

    await ensurePlaceholderAsset(admin, access.lesson.video_ref);
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(access.lesson.video_ref, SIGNED_URL_TTL_SECONDS);
    assertQuery(signedError);
    if (!signed?.signedUrl) throw new Error('Unable to sign the video asset.');

    const { data: progress, error: progressError } = await admin
      .from('lms_lesson_progress')
      .select('max_watched_seconds')
      .eq('enrollment_id', access.enrollmentId)
      .eq('lesson_id', access.lesson.id)
      .maybeSingle();
    assertQuery(progressError);

    return jsonResponse(200, {
      url: signed.signedUrl,
      expires_at: new Date(
        Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      ).toISOString(),
      max_watched_seconds: progress?.max_watched_seconds ?? 0,
    });
  } catch (error) {
    if (error instanceof AccessDenied) {
      return jsonResponse(403, DENIED_BODY);
    }
    console.error(
      'lms-playback-token failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return jsonResponse(500, { error: 'Playback is temporarily unavailable.' });
  }
});
