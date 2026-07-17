import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  courseUnlocked,
  moduleUnlocked,
  termsGateSatisfied,
  type ProgressionContext,
} from './progression.ts';
import { PLACEHOLDER_MP4_BASE64, PLACEHOLDER_PATH } from './placeholder.ts';

const BUCKET = 'lms-video';
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
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
    module_id: string;
    kind: 'video' | 'reading';
    video_ref: string | null;
    duration_seconds: number | null;
    is_required: boolean;
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
    .select('id,module_id,kind,video_ref,duration_seconds,is_required')
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
    ? await admin.from('lms_completion_events').select('enrollment_id').in('enrollment_id', enrollmentIds)
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
  const [lessonsResult, quizzesResult, progressResult, attemptsResult] = await Promise.all([
    moduleIds.length
      ? admin.from('lms_lessons').select('id,module_id,kind,duration_seconds,is_required').in('module_id', moduleIds)
      : Promise.resolve({ data: [], error: null }),
    moduleIds.length
      ? admin.from('lms_module_quizzes').select('id,module_id').in('module_id', moduleIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('lms_lesson_progress').select('lesson_id,completed_at,max_watched_seconds').eq('enrollment_id', enrollment.id),
    admin.from('lms_quiz_attempts').select('quiz_id,attempt_number,passed').eq('enrollment_id', enrollment.id),
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
  return { enrollmentId: enrollment.id, lesson };
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const body = await req.json().catch(() => ({}));
    const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
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
      expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      max_watched_seconds: progress?.max_watched_seconds ?? 0,
    });
  } catch (error) {
    if (error instanceof AccessDenied) return jsonResponse(403, DENIED_BODY);
    console.error('lms-playback-token failed', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse(500, { error: 'Playback is temporarily unavailable.' });
  }
});
