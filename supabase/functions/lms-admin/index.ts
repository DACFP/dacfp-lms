import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const DENIED_BODY = { error: 'Admin access is unavailable.' };
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const RESOURCE_BUCKET = 'lms-resources';
const RESOURCE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
]);
const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;

class AccessDenied extends Error {}
class InvalidRequest extends Error {}

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

async function requireOperator(req: Request, admin: SupabaseClient) {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new AccessDenied();
  const token = authorization.slice('Bearer '.length);
  const { data, error } = await admin.auth.getUser(token);
  if (
    error ||
    !data.user ||
    data.user.app_metadata?.role !== 'operator'
  ) {
    throw new AccessDenied();
  }
  return data.user;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InvalidRequest(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredUuid(value: unknown, field: string) {
  const result = requiredString(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new InvalidRequest(`${field} is invalid.`);
  }
  return result;
}

function optionalUuid(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  return requiredUuid(value, field);
}

function asNumber(value: unknown, field: string, nullable = false) {
  if (nullable && (value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new InvalidRequest(`${field} is invalid.`);
  }
  return number;
}

function assertQuery(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function audit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  target: Record<string, unknown>,
) {
  const { error } = await admin.from('lms_admin_actions').insert({
    actor_auth_user_id: actorId,
    action,
    target,
  });
  assertQuery(error);
}

async function adminCrud(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc('lms_admin_crud', {
    p_actor_auth_user_id: actorId,
    p_action: action,
    p_payload: payload,
  });
  assertQuery(error);
  return data;
}

async function catalog(admin: SupabaseClient) {
  const [courses, modules, lessons, resources, quizzes] = await Promise.all([
    admin.from('lms_courses').select('*').order('created_at'),
    admin.from('lms_modules').select('*').order('course_id').order('position'),
    admin.from('lms_lessons').select('*').order('module_id').order('position'),
    admin.from('lms_lesson_resources').select('*').order('lesson_id').order('position'),
    admin.from('lms_module_quizzes').select('*').order('module_id'),
  ]);
  for (const result of [courses, modules, lessons, resources, quizzes]) {
    assertQuery(result.error);
  }
  return {
    courses: courses.data ?? [],
    modules: modules.data ?? [],
    lessons: lessons.data ?? [],
    resources: resources.data ?? [],
    quizzes: quizzes.data ?? [],
  };
}

async function createCourse(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const row = {
    slug: requiredString(input.slug, 'slug').toLowerCase(),
    title: requiredString(input.title, 'title'),
    description: requiredString(input.description, 'description'),
    status: input.status === 'published' || input.status === 'archived' ? input.status : 'draft',
    progression: input.progression === 'open' ? 'open' : 'sequential',
    prerequisite_course_id: optionalUuid(input.prerequisite_course_id, 'prerequisite_course_id'),
    ce_credits: asNumber(input.ce_credits, 'ce_credits', true),
    requires_terms_acceptance: input.requires_terms_acceptance === true,
  };
  return adminCrud(admin, actorId, 'create_course', row);
}

async function updateCourse(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const courseId = requiredUuid(input.id, 'id');
  if (input.pass_pct !== undefined && Number(input.pass_pct) !== 70) {
    throw new InvalidRequest('pass_pct is published policy and must remain 70.');
  }
  const patch: Record<string, unknown> = {};
  if (input.slug !== undefined) patch.slug = requiredString(input.slug, 'slug').toLowerCase();
  if (input.title !== undefined) patch.title = requiredString(input.title, 'title');
  if (input.description !== undefined) patch.description = requiredString(input.description, 'description');
  if (input.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(String(input.status))) throw new InvalidRequest('status is invalid.');
    patch.status = input.status;
  }
  if (input.progression !== undefined) {
    if (!['sequential', 'open'].includes(String(input.progression))) throw new InvalidRequest('progression is invalid.');
    patch.progression = input.progression;
  }
  if (input.prerequisite_course_id !== undefined) {
    const prerequisiteId = optionalUuid(input.prerequisite_course_id, 'prerequisite_course_id');
    if (prerequisiteId === courseId) throw new InvalidRequest('A course cannot require itself.');
    patch.prerequisite_course_id = prerequisiteId;
  }
  if (input.ce_credits !== undefined) patch.ce_credits = asNumber(input.ce_credits, 'ce_credits', true);
  if (input.requires_terms_acceptance !== undefined) patch.requires_terms_acceptance = input.requires_terms_acceptance === true;
  return adminCrud(admin, actorId, 'update_course', { id: courseId, ...patch });
}

async function deleteRow(
  admin: SupabaseClient,
  actorId: string,
  action: 'delete_course' | 'delete_module' | 'delete_lesson',
  input: Record<string, unknown>,
) {
  const id = requiredUuid(input.id, 'id');
  return adminCrud(admin, actorId, action, { id });
}

async function createModule(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const courseId = requiredUuid(input.course_id, 'course_id');
  const row = {
    course_id: courseId,
    ...(input.position === undefined ? {} : { position: asNumber(input.position, 'position') }),
    title: requiredString(input.title, 'title'),
    ce_credits: asNumber(input.ce_credits, 'ce_credits', true),
  };
  return adminCrud(admin, actorId, 'create_module', row);
}

async function updateModule(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const id = requiredUuid(input.id, 'id');
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = requiredString(input.title, 'title');
  if (input.ce_credits !== undefined) patch.ce_credits = asNumber(input.ce_credits, 'ce_credits', true);
  return adminCrud(admin, actorId, 'update_module', { id, ...patch });
}

async function createLesson(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const moduleId = requiredUuid(input.module_id, 'module_id');
  const kind = input.kind === 'reading' ? 'reading' : 'video';
  const row = {
    module_id: moduleId,
    ...(input.position === undefined ? {} : { position: asNumber(input.position, 'position') }),
    title: requiredString(input.title, 'title'),
    kind,
    video_ref: kind === 'video' ? optionalString(input.video_ref) : null,
    duration_seconds: kind === 'video' ? asNumber(input.duration_seconds, 'duration_seconds', true) : null,
    body_md: kind === 'reading' ? optionalString(input.body_md) : null,
    is_required: input.is_required !== false,
  };
  return adminCrud(admin, actorId, 'create_lesson', row);
}

async function updateLesson(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const id = requiredUuid(input.id, 'id');
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = requiredString(input.title, 'title');
  if (input.kind !== undefined) {
    if (!['video', 'reading'].includes(String(input.kind))) throw new InvalidRequest('kind is invalid.');
    patch.kind = input.kind;
    if (input.kind === 'reading') {
      patch.video_ref = null;
      patch.duration_seconds = null;
    } else {
      patch.body_md = null;
    }
  }
  if (input.video_ref !== undefined) patch.video_ref = optionalString(input.video_ref);
  if (input.duration_seconds !== undefined) patch.duration_seconds = asNumber(input.duration_seconds, 'duration_seconds', true);
  if (input.body_md !== undefined) patch.body_md = optionalString(input.body_md);
  if (input.is_required !== undefined) patch.is_required = input.is_required === true;
  return adminCrud(admin, actorId, 'update_lesson', { id, ...patch });
}

function decodeBase64(value: string) {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new InvalidRequest('File content is invalid.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'resource';
}

async function uploadResource(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const lessonId = requiredUuid(input.lesson_id, 'lesson_id');
  const title = requiredString(input.title, 'title');
  const fileName = safeFileName(requiredString(input.file_name, 'file_name'));
  const mimeType = requiredString(input.mime_type, 'mime_type').toLowerCase();
  if (!RESOURCE_MIME_TYPES.has(mimeType)) throw new InvalidRequest('File type is not allowed.');
  const encoded = requiredString(input.base64, 'base64');
  if (encoded.length > Math.ceil(MAX_RESOURCE_BYTES * 4 / 3) + 4) {
    throw new InvalidRequest('File size is not allowed.');
  }
  const content = decodeBase64(encoded);
  if (content.byteLength === 0 || content.byteLength > MAX_RESOURCE_BYTES) throw new InvalidRequest('File size is not allowed.');
  const objectPath = `${lessonId}/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await admin.storage.from(RESOURCE_BUCKET).upload(objectPath, content, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  assertQuery(uploadError);
  const { count, error: countError } = await admin.from('lms_lesson_resources').select('id', { count: 'exact', head: true }).eq('lesson_id', lessonId);
  assertQuery(countError);
  const { data, error } = await admin.from('lms_lesson_resources').insert({
    lesson_id: lessonId,
    position: (count ?? 0) + 1,
    title,
    file_ref: objectPath,
  }).select('*').single();
  if (error) {
    await admin.storage.from(RESOURCE_BUCKET).remove([objectPath]);
    throw new Error(error.message);
  }
  await audit(admin, actorId, 'upload_resource', { resource_id: data.id, lesson_id: lessonId, file_ref: objectPath });
  return data;
}

async function exportQuestionBank(admin: SupabaseClient, moduleId: string) {
  const { data: quiz, error: quizError } = await admin.from('lms_module_quizzes').select('*').eq('module_id', moduleId).maybeSingle();
  assertQuery(quizError);
  if (!quiz) throw new InvalidRequest('Question bank is unavailable.');
  const { data, error } = await admin.from('lms_quiz_questions').select('position,prompt,choices,correct,points').eq('quiz_id', quiz.id).order('position');
  assertQuery(error);
  return {
    pass_pct: quiz.pass_pct,
    questions: (data ?? []).map((question) => {
      const choices = new Map((question.choices as Array<{ id: string; text: string }>).map((choice) => [choice.id, choice.text]));
      return {
        position: question.position,
        prompt: question.prompt,
        choice_a: choices.get('a') ?? '',
        choice_b: choices.get('b') ?? '',
        choice_c: choices.get('c') ?? '',
        choice_d: choices.get('d') ?? '',
        correct: (question.correct as string[])[0] ?? '',
        points: question.points,
      };
    }),
  };
}

async function inspectLearner(admin: SupabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data: user, error: userError } = await admin.rpc(
    'lms_admin_find_auth_user_by_email',
    { p_email: normalized },
  );
  assertQuery(userError);
  if (!user) return null;
  const [profile, enrollments] = await Promise.all([
    admin.from('lms_learner_profiles').select('*').eq('auth_user_id', user.id).maybeSingle(),
    admin.from('lms_enrollments').select('*,lms_courses(id,slug,title,ce_credits)').eq('auth_user_id', user.id).order('enrolled_at'),
  ]);
  assertQuery(profile.error);
  assertQuery(enrollments.error);
  const enrollmentIds = (enrollments.data ?? []).map((row) => row.id);
  const [progress, attempts, completions] = enrollmentIds.length
    ? await Promise.all([
        admin.from('lms_lesson_progress').select('*').in('enrollment_id', enrollmentIds).order('updated_at'),
        admin.from('lms_quiz_attempts').select('*').in('enrollment_id', enrollmentIds).order('started_at'),
        admin.from('lms_completion_events').select('*').in('enrollment_id', enrollmentIds).order('completed_at'),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  assertQuery(progress.error);
  assertQuery(attempts.error);
  assertQuery(completions.error);

  const summaries = await Promise.all((enrollments.data ?? []).map(async (enrollment) => {
    const course = Array.isArray(enrollment.lms_courses) ? enrollment.lms_courses[0] : enrollment.lms_courses;
    const { data: modules } = await admin.from('lms_modules').select('id').eq('course_id', course.id);
    const moduleIds = (modules ?? []).map((row) => row.id);
    const [{ data: lessons }, { data: quizzes }] = moduleIds.length
      ? await Promise.all([
          admin.from('lms_lessons').select('id').in('module_id', moduleIds).eq('is_required', true),
          admin.from('lms_module_quizzes').select('id').in('module_id', moduleIds),
        ])
      : [{ data: [] }, { data: [] }];
    const completedLessonIds = new Set((progress.data ?? []).filter((row) => row.enrollment_id === enrollment.id && row.completed_at).map((row) => row.lesson_id));
    const passedQuizIds = new Set((attempts.data ?? []).filter((row) => row.enrollment_id === enrollment.id && row.passed).map((row) => row.quiz_id));
    const required = (lessons?.length ?? 0) + (quizzes?.length ?? 0);
    const completed = (lessons ?? []).filter((row) => completedLessonIds.has(row.id)).length + (quizzes ?? []).filter((row) => passedQuizIds.has(row.id)).length;
    return { enrollment_id: enrollment.id, percent_complete: required ? Math.round((completed / required) * 100) : 0 };
  }));

  return {
    user: { id: user.id, email: user.email },
    profile: profile.data,
    enrollments: enrollments.data ?? [],
    progress: progress.data ?? [],
    attempts: attempts.data ?? [],
    completions: completions.data ?? [],
    summaries,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const admin = serviceClient();
    const actor = await requireOperator(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = requiredString(body.action, 'action');
    const payload = body.payload && typeof body.payload === 'object'
      ? body.payload as Record<string, unknown>
      : {};

    let data: unknown;
    switch (action) {
      case 'list_catalog': data = await catalog(admin); break;
      case 'list_audit': {
        const result = await admin.from('lms_admin_actions').select('*').order('created_at', { ascending: false }).limit(250);
        assertQuery(result.error);
        data = result.data ?? [];
        break;
      }
      case 'inspect_learner': data = await inspectLearner(admin, requiredString(payload.email, 'email')); break;
      case 'export_question_bank': data = await exportQuestionBank(admin, requiredUuid(payload.module_id, 'module_id')); break;
      case 'create_course': data = await createCourse(admin, actor.id, payload); break;
      case 'update_course': data = await updateCourse(admin, actor.id, payload); break;
      case 'delete_course': data = await deleteRow(admin, actor.id, 'delete_course', payload); break;
      case 'create_module': data = await createModule(admin, actor.id, payload); break;
      case 'update_module': data = await updateModule(admin, actor.id, payload); break;
      case 'delete_module': data = await deleteRow(admin, actor.id, 'delete_module', payload); break;
      case 'create_lesson': data = await createLesson(admin, actor.id, payload); break;
      case 'update_lesson': data = await updateLesson(admin, actor.id, payload); break;
      case 'delete_lesson': data = await deleteRow(admin, actor.id, 'delete_lesson', payload); break;
      case 'reorder': {
        const { data: result, error } = await admin.rpc('lms_admin_reorder', {
          p_actor_auth_user_id: actor.id,
          p_kind: requiredString(payload.kind, 'kind'),
          p_parent_id: requiredUuid(payload.parent_id, 'parent_id'),
          p_ordered_ids: Array.isArray(payload.ordered_ids) ? payload.ordered_ids : [],
        });
        assertQuery(error);
        data = result;
        break;
      }
      case 'import_question_bank': {
        if (Number(payload.pass_pct) !== 70) throw new InvalidRequest('pass_pct is published policy and must remain 70.');
        const { data: result, error } = await admin.rpc('lms_admin_import_question_bank', {
          p_actor_auth_user_id: actor.id,
          p_module_id: requiredUuid(payload.module_id, 'module_id'),
          p_pass_pct: 70,
          p_questions: Array.isArray(payload.questions) ? payload.questions : [],
        });
        assertQuery(error);
        data = result;
        break;
      }
      case 'upload_resource': data = await uploadResource(admin, actor.id, payload); break;
      case 'reset_attempt_history':
      case 'manual_mark_complete': {
        const { data: result, error } = await admin.rpc('lms_admin_support_action', {
          p_actor_auth_user_id: actor.id,
          p_action: action,
          p_enrollment_id: requiredUuid(payload.enrollment_id, 'enrollment_id'),
          p_quiz_id: action === 'reset_attempt_history' ? requiredUuid(payload.quiz_id, 'quiz_id') : null,
        });
        assertQuery(error);
        data = result;
        break;
      }
      default: throw new InvalidRequest('Unsupported admin action.');
    }

    return jsonResponse(200, { data });
  } catch (error) {
    if (error instanceof AccessDenied) return jsonResponse(403, DENIED_BODY);
    if (error instanceof InvalidRequest) return jsonResponse(400, { error: error.message });
    console.error('lms-admin failed', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse(500, { error: 'Admin request could not be completed.' });
  }
});
