import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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
  const { data, error } = await admin.auth.getUser(
    authorization.slice('Bearer '.length),
  );
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
    .select('id,module_id')
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
  if (course.requires_terms_acceptance && !enrollment.terms_accepted_at) {
    throw new AccessDenied();
  }

  if (course.prerequisite_course_id) {
    const { data: prerequisiteEnrollment, error: prerequisiteError } = await admin
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
        return Boolean(requiredLesson.duration_seconds) &&
          progress.max_watched_seconds >= Number(requiredLesson.duration_seconds) * 0.95;
      });
      if (!complete) throw new AccessDenied();
    }
  }

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
    const body = await req.json() as { resource_id?: unknown };
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
