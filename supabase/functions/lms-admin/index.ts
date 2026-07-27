import { corsHeaders } from './cors.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const DENIED_BODY = { error: 'Admin access is unavailable.' };
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

function jsonResponse(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
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
    data.user.app_metadata?.lms_role !== 'operator'
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
  // PostgreSQL's uuid type accepts all 128-bit UUID values. Synthetic seed
  // records derived deterministically from md5 are valid UUIDs even when the
  // version/variant bits do not match RFC-generated identifiers.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) {
    throw new InvalidRequest(`${field} is invalid.`);
  }
  return result;
}

function optionalUuid(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  return requiredUuid(value, field);
}

function requiredUuidArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidRequest(`${field} is required.`);
  }
  return [...new Set(value.map((item) => requiredUuid(item, field)))];
}

function requiredDate(value: unknown, field: string) {
  const result = requiredString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new InvalidRequest(`${field} is invalid.`);
  }
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new InvalidRequest(`${field} is invalid.`);
  }
  return result;
}

function asNumber(value: unknown, field: string, nullable = false) {
  if (nullable && (value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new InvalidRequest(`${field} is invalid.`);
  }
  return number;
}

function assertQuery(error: { code?: string; message: string } | null) {
  if (error?.code === '22023') throw new InvalidRequest(error.message);
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
  const [courses, modules, lessons, resources, quizzes, surveySections, surveyQuestions] = await Promise.all([
    admin.from('lms_courses').select('*').order('created_at'),
    admin.from('lms_modules').select('*').order('course_id').order('position'),
    admin.from('lms_lessons').select('*').order('module_id').order('position'),
    admin.from('lms_lesson_resources').select('*').order('lesson_id').order('position'),
    admin.from('lms_module_quizzes').select('*').order('module_id'),
    admin.from('lms_survey_sections').select('*').order('lesson_id').order('position'),
    admin.from('lms_survey_questions').select('*').order('section_id').order('position'),
  ]);
  for (const result of [courses, modules, lessons, resources, quizzes, surveySections, surveyQuestions]) {
    assertQuery(result.error);
  }
  return {
    courses: courses.data ?? [],
    modules: modules.data ?? [],
    lessons: lessons.data ?? [],
    resources: resources.data ?? [],
    quizzes: quizzes.data ?? [],
    surveySections: surveySections.data ?? [],
    surveyQuestions: surveyQuestions.data ?? [],
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
    bridge_copy: optionalString(input.bridge_copy),
  };
  return adminCrud(admin, actorId, 'create_module', row);
}

async function updateModule(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const id = requiredUuid(input.id, 'id');
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = requiredString(input.title, 'title');
  if (input.ce_credits !== undefined) patch.ce_credits = asNumber(input.ce_credits, 'ce_credits', true);
  if (input.bridge_copy !== undefined) patch.bridge_copy = optionalString(input.bridge_copy);
  return adminCrud(admin, actorId, 'update_module', { id, ...patch });
}

async function createLesson(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const moduleId = requiredUuid(input.module_id, 'module_id');
  const kind = input.kind === 'reading' || input.kind === 'survey'
    ? input.kind
    : 'video';
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
    if (!['video', 'reading', 'survey'].includes(String(input.kind))) throw new InvalidRequest('kind is invalid.');
    patch.kind = input.kind;
    if (input.kind !== 'video') {
      patch.video_ref = null;
      patch.duration_seconds = null;
    }
    if (input.kind !== 'reading') {
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

async function exportQuestionBank(
  admin: SupabaseClient,
  actorId: string,
  moduleId: string,
) {
  const [{ data: module, error: moduleError }, { data: quiz, error: quizError }] =
    await Promise.all([
      admin.from('lms_modules').select('id,position').eq('id', moduleId).maybeSingle(),
      admin.from('lms_module_quizzes').select('*').eq('module_id', moduleId).maybeSingle(),
    ]);
  assertQuery(moduleError);
  assertQuery(quizError);
  if (!module || !quiz) throw new InvalidRequest('Question bank is unavailable.');
  const { data, error } = await admin.from('lms_quiz_questions').select('position,prompt,choices,correct,points').eq('quiz_id', quiz.id).order('position');
  assertQuery(error);
  const moduleSelector = `module_${String(module.position).padStart(2, '0')}`;
  const questions = (data ?? []).map((question) => ({
        position: question.position,
        prompt: question.prompt,
        choices: question.choices as Array<{ id: string; text: string }>,
        correct: question.correct as string[],
      }));
  await audit(admin, actorId, 'export_question_bank', {
    module_id: moduleId,
    quiz_id: quiz.id,
    question_count: questions.length,
  });
  return {
    format: 'dacfp-question-bank-v1',
    modules: {
      [moduleSelector]: { questions },
    },
  };
}

type SurveySection = {
  id: string;
  lesson_id: string;
  position: number;
  title: string | null;
  default_next_section_id: string | null;
};

type SurveyQuestion = {
  id: string;
  lesson_id: string;
  section_id: string;
  position: number;
  prompt: string;
  kind: 'scale_1_5' | 'text' | 'single_choice' | 'multi_choice';
  choices: Array<{ id: string; text: string; allow_free_text?: boolean }> | null;
  required: boolean;
  routes: Record<string, string> | null;
};

type SurveyResponseRow = {
  answers: Record<string, unknown>;
  choice_free_text: Record<string, Record<string, string>>;
  path: string[];
};

function surveyBreakdown(question: SurveyQuestion, responses: SurveyResponseRow[]) {
  const values = responses
    .map((response) => response.answers?.[question.id])
    .filter((value) => value !== undefined && value !== null && value !== '');

  if (question.kind === 'scale_1_5') {
    const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    const numeric = values.filter((value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5);
    for (const value of numeric) counts[String(value)] += 1;
    return {
      kind: question.kind,
      counts,
      average: numeric.length
        ? Number((numeric.reduce((total, value) => total + Number(value), 0) / numeric.length).toFixed(2))
        : null,
    };
  }

  if (question.kind === 'text') {
    return {
      kind: question.kind,
      responses: values.filter((value): value is string => typeof value === 'string'),
    };
  }

  const counts = (question.choices ?? []).map((choice) => ({
    ...choice,
    count: 0,
    free_text: [] as string[],
  }));
  for (const response of responses) {
    const value = response.answers?.[question.id];
    const selected = Array.isArray(value) ? value : [value];
    for (const choice of counts) {
      if (!selected.includes(choice.id)) continue;
      choice.count += 1;
      const detail = response.choice_free_text?.[question.id]?.[choice.id];
      if (typeof detail === 'string' && detail) choice.free_text.push(detail);
    }
  }
  return { kind: question.kind, counts };
}

async function surveyResults(
  admin: SupabaseClient,
  actorId: string,
  lessonId: string,
) {
  const { data: lesson, error: lessonError } = await admin
    .from('lms_lessons')
    .select('id,module_id,title,kind')
    .eq('id', lessonId)
    .maybeSingle();
  assertQuery(lessonError);
  if (!lesson || lesson.kind !== 'survey') throw new InvalidRequest('Survey is unavailable.');
  const { data: module, error: moduleError } = await admin
    .from('lms_modules')
    .select('course_id')
    .eq('id', lesson.module_id)
    .single();
  assertQuery(moduleError);
  const { data: course, error: courseError } = await admin
    .from('lms_courses')
    .select('id,title')
    .eq('id', module.course_id)
    .single();
  assertQuery(courseError);
  const [sections, questions, responses, enrolled] = await Promise.all([
    admin.from('lms_survey_sections').select('*').eq('lesson_id', lessonId).order('position'),
    admin.from('lms_survey_questions').select('*').eq('lesson_id', lessonId).order('section_id').order('position'),
    admin.from('lms_survey_responses').select('answers,choice_free_text,path').eq('lesson_id', lessonId),
    admin.from('lms_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', course.id),
  ]);
  for (const result of [sections, questions, responses, enrolled]) assertQuery(result.error);
  const sectionRows = (sections.data ?? []) as SurveySection[];
  const sectionPosition = new Map(sectionRows.map((section) => [section.id, section.position]));
  const responseRows = (responses.data ?? []) as SurveyResponseRow[];
  const enrollmentCount = enrolled.count ?? 0;
  const distribution = new Map<string, { path: string[]; count: number }>();
  for (const response of responseRows) {
    const key = response.path.join('>');
    const current = distribution.get(key);
    if (current) current.count += 1;
    else distribution.set(key, { path: response.path, count: 1 });
  }
  await audit(admin, actorId, 'view_survey_results', {
    lesson_id: lessonId,
    response_count: responseRows.length,
  });
  const questionRows = ((questions.data ?? []) as SurveyQuestion[]).sort((left, right) =>
    (sectionPosition.get(left.section_id) ?? 0) - (sectionPosition.get(right.section_id) ?? 0)
      || left.position - right.position
  );
  return {
    lesson: { id: lesson.id, title: lesson.title },
    course,
    response_count: responseRows.length,
    enrolled_count: enrollmentCount,
    completion_rate: enrollmentCount
      ? Number(((responseRows.length / enrollmentCount) * 100).toFixed(2))
      : 0,
    sections: sectionRows,
    path_distribution: [...distribution.values()].sort((left, right) => right.count - left.count),
    questions: questionRows.map((question) => {
      const eligible = responseRows.filter((response) => response.path.includes(question.section_id));
      return {
        question,
        denominator: eligible.length,
        breakdown: surveyBreakdown(question, eligible),
      };
    }),
  };
}

function csvCell(value: unknown) {
  let text = Array.isArray(value) ? value.join(' | ') : value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportSurveyResponses(
  admin: SupabaseClient,
  actorId: string,
  input: Record<string, unknown>,
) {
  const lessonId = optionalUuid(input.lesson_id, 'lesson_id');
  const courseId = optionalUuid(input.course_id, 'course_id');
  if ((lessonId ? 1 : 0) + (courseId ? 1 : 0) !== 1) {
    throw new InvalidRequest('Choose one survey or one course export.');
  }

  let lessons: Array<{ id: string; title: string }> = [];
  let exportCourseId = courseId;
  if (lessonId) {
    const { data: lesson, error } = await admin
      .from('lms_lessons')
      .select('id,module_id,title,kind')
      .eq('id', lessonId)
      .maybeSingle();
    assertQuery(error);
    if (!lesson || lesson.kind !== 'survey') throw new InvalidRequest('Survey is unavailable.');
    const { data: module, error: moduleError } = await admin
      .from('lms_modules')
      .select('course_id')
      .eq('id', lesson.module_id)
      .single();
    assertQuery(moduleError);
    exportCourseId = module.course_id;
    lessons = [{ id: lesson.id, title: lesson.title }];
  } else {
    const { data: modules, error: moduleError } = await admin
      .from('lms_modules')
      .select('id')
      .eq('course_id', courseId!);
    assertQuery(moduleError);
    const moduleIds = (modules ?? []).map((module) => module.id);
    const { data, error } = moduleIds.length
      ? await admin
          .from('lms_lessons')
          .select('id,title')
          .in('module_id', moduleIds)
          .eq('kind', 'survey')
          .order('position')
      : { data: [], error: null };
    assertQuery(error);
    lessons = data ?? [];
  }

  const lessonIds = lessons.map((lesson) => lesson.id);
  const [sections, questions, responses, course] = await Promise.all([
    lessonIds.length
      ? admin.from('lms_survey_sections').select('*').in('lesson_id', lessonIds).order('lesson_id').order('position')
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? admin.from('lms_survey_questions').select('*').in('lesson_id', lessonIds).order('section_id').order('position')
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? admin.from('lms_survey_responses').select('lesson_id,submitted_at,answers,choice_free_text,path,lms_enrollments(person_email)').in('lesson_id', lessonIds).order('submitted_at')
      : Promise.resolve({ data: [], error: null }),
    admin.from('lms_courses').select('slug').eq('id', exportCourseId!).single(),
  ]);
  assertQuery(sections.error);
  assertQuery(questions.error);
  assertQuery(responses.error);
  assertQuery(course.error);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const sectionRows = (sections.data ?? []) as SurveySection[];
  const sectionById = new Map(sectionRows.map((section) => [section.id, section]));
  const questionRows = ((questions.data ?? []) as SurveyQuestion[]).sort((left, right) =>
    (sectionById.get(left.section_id)?.position ?? 0) - (sectionById.get(right.section_id)?.position ?? 0)
      || left.position - right.position
  );
  const headers = [
    'email',
    'submitted_at',
    'survey',
    'path',
    ...questionRows.map((question) =>
      `${lessonById.get(question.lesson_id)?.title ?? 'Survey'} — ${sectionById.get(question.section_id)?.title ?? `Section ${sectionById.get(question.section_id)?.position ?? ''}`} — ${question.prompt}`
    ),
  ];
  const rows = (responses.data ?? []).map((response) => {
    const enrollment = Array.isArray(response.lms_enrollments)
      ? response.lms_enrollments[0]
      : response.lms_enrollments;
    const answers = response.answers as Record<string, unknown>;
    const choiceFreeText = response.choice_free_text as Record<string, Record<string, string>>;
    const path = response.path as string[];
    const pathLabel = path.map((sectionId) => {
      const section = sectionById.get(sectionId);
      return section ? `§${section.position}${section.title ? ` ${section.title}` : ''}` : sectionId;
    }).join(' > ');
    return [
      enrollment?.person_email ?? '',
      response.submitted_at,
      lessonById.get(response.lesson_id)?.title ?? '',
      pathLabel,
      ...questionRows.map((question) => {
        if (question.lesson_id !== response.lesson_id || !path.includes(question.section_id)) return '';
        const value = answers?.[question.id];
        if (value === undefined || value === null) return '';
        const selected = Array.isArray(value) ? value : [value];
        if (!['single_choice', 'multi_choice'].includes(question.kind)) return value;
        return selected.map((choiceId) => {
          const label = question.choices?.find((choice) => choice.id === choiceId)?.text ?? choiceId;
          const detail = choiceFreeText?.[question.id]?.[String(choiceId)];
          return detail ? `${label}: ${detail}` : label;
        });
      }),
    ];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  await audit(admin, actorId, 'export_survey_responses', {
    lesson_id: lessonId,
    course_id: courseId,
    row_count: rows.length,
  });
  return {
    file_name: `${course.data.slug}-${lessonId ? 'survey' : 'all-surveys'}-responses.csv`,
    csv,
    row_count: rows.length,
  };
}

async function previewCeReport(
  admin: SupabaseClient,
  actorId: string,
  input: Record<string, unknown>,
) {
  const courseIds = requiredUuidArray(input.course_ids, 'course_ids');
  const periodStart = requiredDate(input.period_start, 'period_start');
  const periodEnd = requiredDate(input.period_end, 'period_end');
  if (periodEnd < periodStart) throw new InvalidRequest('period_end is invalid.');
  const { data, error } = await admin.rpc('lms_admin_preview_ce_report', {
    p_actor_auth_user_id: actorId,
    p_course_ids: courseIds,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_include_already_reported: input.include_already_reported === true,
    p_include_manual: input.include_manual === true,
  });
  assertQuery(error);
  const buckets = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {};
  const count = (key: string) => Array.isArray(buckets[key])
    ? buckets[key].length
    : 0;
  await audit(admin, actorId, 'preview_ce_report', {
    course_ids: courseIds,
    period_start: periodStart,
    period_end: periodEnd,
    counts: {
      reportable: count('reportable'),
      manual: count('manual'),
      missing_id: count('missing_id'),
      already_reported: count('already_reported'),
      excluded: count('excluded'),
    },
    include_already_reported: input.include_already_reported === true,
    include_manual: input.include_manual === true,
  });
  return data;
}

async function createCeReportRun(
  admin: SupabaseClient,
  actorId: string,
  input: Record<string, unknown>,
) {
  const courseIds = requiredUuidArray(input.course_ids, 'course_ids');
  const periodStart = requiredDate(input.period_start, 'period_start');
  const periodEnd = requiredDate(input.period_end, 'period_end');
  if (periodEnd < periodStart) throw new InvalidRequest('period_end is invalid.');
  const { data, error } = await admin.rpc('lms_admin_create_ce_report_run', {
    p_actor_auth_user_id: actorId,
    p_course_ids: courseIds,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_completion_ids: requiredUuidArray(input.completion_ids, 'completion_ids'),
    p_include_already_reported: input.include_already_reported === true,
    p_include_manual: input.include_manual === true,
  });
  assertQuery(error);
  return data;
}

async function inspectLearner(
  admin: SupabaseClient,
  actorId: string,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  const { data: user, error: userError } = await admin.rpc(
    'lms_admin_find_auth_user_by_email',
    { p_email: normalized },
  );
  assertQuery(userError);
  if (!user) {
    await audit(admin, actorId, 'inspect_learner', {
      email: normalized,
      found: false,
      enrollment_count: 0,
    });
    return null;
  }
  const [profile, enrollments] = await Promise.all([
    admin.from('lms_learner_profiles').select('*').eq('auth_user_id', user.id).maybeSingle(),
    admin.from('lms_enrollments').select('*,lms_courses(id,slug,title,ce_credits,cfp_program_id)').eq('auth_user_id', user.id).order('enrolled_at'),
  ]);
  assertQuery(profile.error);
  assertQuery(enrollments.error);
  const enrollmentIds = (enrollments.data ?? []).map((row) => row.id);
  const [progress, attempts, surveyResponses, completions] = enrollmentIds.length
    ? await Promise.all([
        admin.from('lms_lesson_progress').select('*').in('enrollment_id', enrollmentIds).order('updated_at'),
        admin.from('lms_quiz_attempts').select('*').in('enrollment_id', enrollmentIds).order('started_at'),
        admin.from('lms_survey_responses').select('*').in('enrollment_id', enrollmentIds).order('submitted_at'),
        admin.from('lms_completion_events').select('*').in('enrollment_id', enrollmentIds).order('completed_at'),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  assertQuery(progress.error);
  assertQuery(attempts.error);
  assertQuery(surveyResponses.error);
  assertQuery(completions.error);

  const courseIds = [...new Set((enrollments.data ?? []).map((enrollment) => {
    const course = Array.isArray(enrollment.lms_courses) ? enrollment.lms_courses[0] : enrollment.lms_courses;
    return course.id;
  }))];
  const modulesResult = courseIds.length
    ? await admin.from('lms_modules').select('id,course_id').in('course_id', courseIds)
    : { data: [], error: null };
  assertQuery(modulesResult.error);
  const moduleIds = (modulesResult.data ?? []).map((module) => module.id);
  const [lessonsResult, quizzesResult] = moduleIds.length
    ? await Promise.all([
        admin
          .from('lms_lessons')
          .select('id,module_id,kind')
          .in('module_id', moduleIds)
          .eq('is_required', true),
        admin
          .from('lms_module_quizzes')
          .select('id,module_id')
          .in('module_id', moduleIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  assertQuery(lessonsResult.error);
  assertQuery(quizzesResult.error);
  const moduleIdsByCourse = new Map<string, Set<string>>();
  for (const module of modulesResult.data ?? []) {
    const ids = moduleIdsByCourse.get(module.course_id) ?? new Set<string>();
    ids.add(module.id);
    moduleIdsByCourse.set(module.course_id, ids);
  }

  const summaries = (enrollments.data ?? []).map((enrollment) => {
    const course = Array.isArray(enrollment.lms_courses) ? enrollment.lms_courses[0] : enrollment.lms_courses;
    const courseModuleIds = moduleIdsByCourse.get(course.id) ?? new Set<string>();
    const lessons = (lessonsResult.data ?? []).filter((lesson) =>
      courseModuleIds.has(lesson.module_id)
    );
    const quizzes = (quizzesResult.data ?? []).filter((quiz) =>
      courseModuleIds.has(quiz.module_id)
    );
    const completedLessonIds = new Set((progress.data ?? []).filter((row) => row.enrollment_id === enrollment.id && row.completed_at).map((row) => row.lesson_id));
    const submittedSurveyIds = new Set((surveyResponses.data ?? []).filter((row) => row.enrollment_id === enrollment.id).map((row) => row.lesson_id));
    const passedQuizIds = new Set((attempts.data ?? []).filter((row) => row.enrollment_id === enrollment.id && row.passed).map((row) => row.quiz_id));
    const required = lessons.length + quizzes.length;
    const completed = lessons.filter((row) =>
      row.kind === 'survey'
        ? submittedSurveyIds.has(row.id)
        : completedLessonIds.has(row.id)
    ).length + quizzes.filter((row) => passedQuizIds.has(row.id)).length;
    return { enrollment_id: enrollment.id, percent_complete: required ? Math.round((completed / required) * 100) : 0 };
  });

  await audit(admin, actorId, 'inspect_learner', {
    email: normalized,
    found: true,
    enrollment_count: (enrollments.data ?? []).length,
  });

  return {
    user: { id: user.id, email: user.email },
    profile: profile.data,
    enrollments: enrollments.data ?? [],
    progress: progress.data ?? [],
    attempts: attempts.data ?? [],
    surveyResponses: surveyResponses.data ?? [],
    completions: completions.data ?? [],
    summaries,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return jsonResponse(req, 405, { error: 'Method not allowed.' });

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
      case 'inspect_learner': data = await inspectLearner(admin, actor.id, requiredString(payload.email, 'email')); break;
      case 'export_question_bank': data = await exportQuestionBank(admin, actor.id, requiredUuid(payload.module_id, 'module_id')); break;
      case 'survey_results': data = await surveyResults(admin, actor.id, requiredUuid(payload.lesson_id, 'lesson_id')); break;
      case 'export_survey_responses': data = await exportSurveyResponses(admin, actor.id, payload); break;
      case 'preview_ce_report': data = await previewCeReport(admin, actor.id, payload); break;
      case 'create_ce_report_run': data = await createCeReportRun(admin, actor.id, payload); break;
      case 'list_ce_report_runs': {
        const result = await admin
          .from('lms_ce_report_runs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(250);
        assertQuery(result.error);
        const rows = result.data ?? [];
        data = rows;
        await audit(admin, actor.id, 'list_ce_report_runs', {
          count: rows.length,
        });
        break;
      }
      case 'create_course': data = await createCourse(admin, actor.id, payload); break;
      case 'update_course': data = await updateCourse(admin, actor.id, payload); break;
      case 'delete_course': data = await deleteRow(admin, actor.id, 'delete_course', payload); break;
      case 'create_module': data = await createModule(admin, actor.id, payload); break;
      case 'update_module': data = await updateModule(admin, actor.id, payload); break;
      case 'delete_module': data = await deleteRow(admin, actor.id, 'delete_module', payload); break;
      case 'create_lesson': data = await createLesson(admin, actor.id, payload); break;
      case 'update_lesson': data = await updateLesson(admin, actor.id, payload); break;
      case 'delete_lesson': data = await deleteRow(admin, actor.id, 'delete_lesson', payload); break;
      case 'replace_survey_questions': {
        const { data: result, error } = await admin.rpc(
          'lms_admin_replace_survey_questions',
          {
            p_actor_auth_user_id: actor.id,
            p_lesson_id: requiredUuid(payload.lesson_id, 'lesson_id'),
            p_questions: Array.isArray(payload.questions) ? payload.questions : [],
          },
        );
        assertQuery(error);
        data = result;
        break;
      }
      case 'replace_survey_flow': {
        const { data: result, error } = await admin.rpc(
          'lms_admin_replace_survey_flow',
          {
            p_actor_auth_user_id: actor.id,
            p_lesson_id: requiredUuid(payload.lesson_id, 'lesson_id'),
            p_sections: Array.isArray(payload.sections) ? payload.sections : [],
            p_confirm_orphan: payload.confirm_orphan === true,
          },
        );
        assertQuery(error);
        data = result;
        break;
      }
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

    return jsonResponse(req, 200, { data });
  } catch (error) {
    if (error instanceof AccessDenied) return jsonResponse(req, 403, DENIED_BODY);
    if (error instanceof InvalidRequest) return jsonResponse(req, 400, { error: error.message });
    console.error('lms-admin failed', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse(req, 500, { error: 'Admin request could not be completed.' });
  }
});
