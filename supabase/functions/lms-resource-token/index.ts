import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  courseUnlocked,
  moduleUnlocked,
  termsGateSatisfied,
  type ProgressionContext,
} from './progression.ts';

const BUCKET = 'lms-resources';
const SIGNED_URL_TTL_SECONDS = 300;
const DENIED_BODY = { error: 'Resource is unavailable.' };
const SEED_PATH = 'seed/bitcoin-foundations-workbook.txt';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  const { data, error } = await admin.auth.getUser(authorization.slice('Bearer '.length));
  if (error || !data.user) throw new AccessDenied();
  return data.user.id;
}

function assertQuery(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function requireResourceAccess(
  admin: SupabaseClient,
  userId: string,
  resourceId: string,
) {
  const { data: resource, error: resourceError } = await admin
    .from('lms_lesson_resources')
    .select('id,lesson_id,title,file_ref')
    .eq('id', resourceId)
    .maybeSingle();
  assertQuery(resourceError);
  if (!resource) throw new AccessDenied();

  const { data: lesson, error: lessonError } = await admin
    .from('lms_lessons')
    .select('id,module_id,kind,duration_seconds,is_required')
    .eq('id', resource.lesson_id)
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
  return resource;
}

async function ensureSeedResource(admin: SupabaseClient, path: string) {
  if (path !== SEED_PATH) return;
  const { data, error } = await admin.storage.from(BUCKET).list('seed', {
    limit: 1,
    search: 'bitcoin-foundations-workbook.txt',
  });
  assertQuery(error);
  if (data?.some((item) => item.name === 'bitcoin-foundations-workbook.txt')) return;
  const content = new TextEncoder().encode(
    'DACFP Bitcoin Foundations Sandbox Workbook\n\nSynthetic training resource for sandbox validation only.\n',
  );
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, content, {
    contentType: 'text/plain',
    cacheControl: '3600',
    upsert: true,
  });
  assertQuery(uploadError);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const admin = serviceClient();
    const userId = await callerId(req, admin);
    const body = await req.json().catch(() => ({}));
    if (typeof body.resource_id !== 'string') throw new AccessDenied();
    const resource = await requireResourceAccess(admin, userId, body.resource_id);
    await ensureSeedResource(admin, resource.file_ref);
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(resource.file_ref, SIGNED_URL_TTL_SECONDS, {
        download: resource.title,
      });
    assertQuery(error);
    if (!data?.signedUrl) throw new AccessDenied();
    return jsonResponse(200, {
      url: data.signedUrl,
      expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      title: resource.title,
    });
  } catch (error) {
    if (error instanceof AccessDenied) return jsonResponse(403, DENIED_BODY);
    console.error('lms-resource-token failed', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse(500, { error: 'Resource is unavailable.' });
  }
});
