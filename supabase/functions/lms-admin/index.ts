import { corsHeaders } from './cors.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { courseComplete, type ProgressionContext } from './progression.ts';

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
  const { data, error } = await admin.rpc('lms_admin_save_module', {
    p_actor_auth_user_id: actorId,
    p_action: 'create_module',
    p_payload: row,
  });
  assertQuery(error);
  return data;
}

async function updateModule(admin: SupabaseClient, actorId: string, input: Record<string, unknown>) {
  const id = requiredUuid(input.id, 'id');
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = requiredString(input.title, 'title');
  if (input.ce_credits !== undefined) patch.ce_credits = asNumber(input.ce_credits, 'ce_credits', true);
  if (input.bridge_copy !== undefined) patch.bridge_copy = optionalString(input.bridge_copy);
  const { data, error } = await admin.rpc('lms_admin_save_module', {
    p_actor_auth_user_id: actorId,
    p_action: 'update_module',
    p_payload: { id, ...patch },
  });
  assertQuery(error);
  return data;
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

const M2_QUIZ_MINIMUM_ATTEMPTS = 2;
const M2_QUIZ_ATTEMPT_VIEW = 'v_lms_m2_quiz_attempt_population';
const M2_QUIZ_QUESTION_VIEW = 'v_lms_m2_quiz_question_population';
const M2_SURVEY_RESPONSE_VIEW = 'v_lms_m2_survey_response_population';

type M2QuizAttemptRow = {
  attempt_id: string;
  enrollment_id: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  module_id: string;
  module_position: number;
  module_title: string;
  quiz_id: string;
  attempt_number: number;
  passed: boolean;
  auth_user_id: string | null;
};

type M2QuizQuestionRow = {
  course_id: string;
  course_slug: string;
  course_title: string;
  module_id: string;
  module_position: number;
  module_title: string;
  quiz_id: string;
  question_id: string;
  question_position: number;
  prompt: string;
  choices: Array<{ id: string; text: string }>;
  correct_choice_ids: string[];
  attempt_id: string | null;
  selected_choice_ids: string[] | null;
  answered_correctly: boolean | null;
};

function percentage(numerator: number, denominator: number) {
  return denominator
    ? Number(((numerator / denominator) * 100).toFixed(2))
    : null;
}

async function allM2CourseRows<T>(
  admin: SupabaseClient,
  view: string,
  columns: string,
  courseId: string,
  orderColumns: string[],
) {
  const rows: T[] = [];
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    let query = admin
      .from(view)
      .select(columns)
      .eq('course_id', courseId);
    for (const column of orderColumns) query = query.order(column);
    const { data, error } = await query.range(offset, offset + batchSize - 1);
    assertQuery(error);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return rows;
}

function m2QuizRollup(attempts: M2QuizAttemptRow[]) {
  const insufficientData = attempts.length < M2_QUIZ_MINIMUM_ATTEMPTS;
  const learnerKey = (attempt: M2QuizAttemptRow) =>
    attempt.auth_user_id ?? `enrollment:${attempt.enrollment_id}`;
  const firstPassByLearnerQuiz = new Map<string, number>();
  for (const attempt of attempts) {
    if (!attempt.passed) continue;
    const key = `${learnerKey(attempt)}:${attempt.quiz_id}`;
    const current = firstPassByLearnerQuiz.get(key);
    if (current === undefined || attempt.attempt_number < current) {
      firstPassByLearnerQuiz.set(key, attempt.attempt_number);
    }
  }
  const attemptsToPass = [...firstPassByLearnerQuiz.values()];
  return {
    attempts: attempts.length,
    unique_learners: new Set(attempts.map(learnerKey)).size,
    pass_rate: insufficientData
      ? null
      : percentage(attempts.filter((attempt) => attempt.passed).length, attempts.length),
    average_attempts_to_pass: insufficientData || !attemptsToPass.length
      ? null
      : Number((attemptsToPass.reduce((sum, value) => sum + value, 0) / attemptsToPass.length).toFixed(2)),
    retake_volume: attempts.filter((attempt) => attempt.attempt_number > 1).length,
    insufficient_data: insufficientData,
  };
}

async function quizAnalytics(
  admin: SupabaseClient,
  input: Record<string, unknown>,
) {
  const courseId = requiredUuid(input.course_id, 'course_id');
  const [attemptRows, responseRows] = await Promise.all([
    allM2CourseRows<M2QuizAttemptRow>(
      admin,
      M2_QUIZ_ATTEMPT_VIEW,
      'attempt_id,enrollment_id,course_id,course_slug,course_title,module_id,module_position,module_title,quiz_id,attempt_number,passed,auth_user_id',
      courseId,
      ['module_position', 'attempt_number', 'attempt_id'],
    ),
    allM2CourseRows<M2QuizQuestionRow>(
      admin,
      M2_QUIZ_QUESTION_VIEW,
      'course_id,course_slug,course_title,module_id,module_position,module_title,quiz_id,question_id,question_position,prompt,choices,correct_choice_ids,attempt_id,selected_choice_ids,answered_correctly',
      courseId,
      ['module_position', 'question_position', 'attempt_id'],
    ),
  ]);
  const course = responseRows[0] ?? attemptRows[0];
  if (!course) throw new InvalidRequest('Quiz analytics are unavailable for this course.');

  const modules = new Map<string, {
    module_id: string;
    position: number;
    title: string;
    quiz_id: string;
    attempts: M2QuizAttemptRow[];
    questions: Map<string, M2QuizQuestionRow[]>;
  }>();

  for (const row of responseRows) {
    const module = modules.get(row.module_id) ?? {
      module_id: row.module_id,
      position: row.module_position,
      title: row.module_title,
      quiz_id: row.quiz_id,
      attempts: [],
      questions: new Map<string, M2QuizQuestionRow[]>(),
    };
    const question = module.questions.get(row.question_id) ?? [];
    question.push(row);
    module.questions.set(row.question_id, question);
    modules.set(row.module_id, module);
  }

  for (const row of attemptRows) {
    const module = modules.get(row.module_id) ?? {
      module_id: row.module_id,
      position: row.module_position,
      title: row.module_title,
      quiz_id: row.quiz_id,
      attempts: [],
      questions: new Map<string, M2QuizQuestionRow[]>(),
    };
    module.attempts.push(row);
    modules.set(row.module_id, module);
  }

  return {
    course: {
      id: course.course_id,
      slug: course.course_slug,
      title: course.course_title,
    },
    minimum_attempts: M2_QUIZ_MINIMUM_ATTEMPTS,
    population_views: {
      attempts: M2_QUIZ_ATTEMPT_VIEW,
      questions: M2_QUIZ_QUESTION_VIEW,
    },
    course_rollup: m2QuizRollup(attemptRows),
    modules: [...modules.values()]
      .sort((left, right) => left.position - right.position)
      .map((module) => {
        const rollup = m2QuizRollup(module.attempts);
        const questions = [...module.questions.values()]
          .map((rows) => {
            const definition = rows[0];
            const answered = rows.filter((row) =>
              row.attempt_id !== null && row.selected_choice_ids !== null
            );
            const misses = answered.filter((row) => row.answered_correctly === false).length;
            const questionInsufficient = answered.length < M2_QUIZ_MINIMUM_ATTEMPTS;
            const choices = definition.choices.map((choice) => {
              const selected = answered.filter((row) =>
                (row.selected_choice_ids ?? []).includes(choice.id)
              ).length;
              return {
                id: choice.id,
                text: choice.text,
                selected_count: selected,
                selected_pct: questionInsufficient
                  ? null
                  : percentage(selected, answered.length),
                correct: definition.correct_choice_ids.includes(choice.id),
              };
            });
            return {
              question_id: definition.question_id,
              position: definition.question_position,
              prompt: definition.prompt,
              attempt_count: answered.length,
              miss_count: misses,
              miss_rate: questionInsufficient
                ? null
                : percentage(misses, answered.length),
              insufficient_data: questionInsufficient,
              choices,
            };
          })
          .sort((left, right) => {
            if (left.miss_rate === null && right.miss_rate === null) return left.position - right.position;
            if (left.miss_rate === null) return 1;
            if (right.miss_rate === null) return -1;
            return right.miss_rate - left.miss_rate || left.position - right.position;
          });

        return {
          module_id: module.module_id,
          position: module.position,
          title: module.title,
          quiz_id: module.quiz_id,
          ...rollup,
          questions,
        };
      }),
  };
}

type M2SurveyFilters = {
  course_id: string | null;
  survey_id: string | null;
  submitted_from: string | null;
  submitted_to: string | null;
};

type M2SurveyPopulationRow = {
  response_id: string;
  enrollment_id: string;
  learner_email: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  enrollment_status: 'active' | 'expired' | 'revoked';
  course_completed_at: string | null;
  module_id: string;
  module_position: number;
  survey_id: string;
  survey_position: number;
  survey_title: string;
  submitted_at: string;
  answers: Record<string, unknown>;
  choice_free_text: Record<string, Record<string, string>>;
  path: string[];
};

function optionalDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  return requiredDate(value, field);
}

function surveyFilters(input: Record<string, unknown>): M2SurveyFilters {
  const filters = {
    course_id: optionalUuid(input.course_id, 'course_id'),
    survey_id: optionalUuid(input.survey_id, 'survey_id'),
    submitted_from: optionalDate(input.submitted_from, 'submitted_from'),
    submitted_to: optionalDate(input.submitted_to, 'submitted_to'),
  };
  if (
    filters.submitted_from &&
    filters.submitted_to &&
    filters.submitted_from > filters.submitted_to
  ) {
    throw new InvalidRequest('submitted_from must not be after submitted_to.');
  }
  return filters;
}

function nextUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function applySurveyFilters(query: any, filters: M2SurveyFilters) {
  let filtered = query;
  if (filters.course_id) filtered = filtered.eq('course_id', filters.course_id);
  if (filters.survey_id) filtered = filtered.eq('survey_id', filters.survey_id);
  if (filters.submitted_from) {
    filtered = filtered.gte('submitted_at', `${filters.submitted_from}T00:00:00Z`);
  }
  if (filters.submitted_to) {
    filtered = filtered.lt('submitted_at', `${nextUtcDate(filters.submitted_to)}T00:00:00Z`);
  }
  return filtered;
}

function pageNumber(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new InvalidRequest('Pagination is invalid.');
  }
  return parsed;
}

function publicSurveyFilters(filters: M2SurveyFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== null),
  );
}

async function listSurveyResponses(
  admin: SupabaseClient,
  input: Record<string, unknown>,
) {
  const filters = surveyFilters(input);
  const page = pageNumber(input.page, 1, 100000);
  const pageSize = pageNumber(input.page_size, 10, 50);
  const offset = (page - 1) * pageSize;
  let query = admin
    .from(M2_SURVEY_RESPONSE_VIEW)
    .select('response_id,learner_email,course_id,course_title,survey_id,survey_title,submitted_at,enrollment_status,course_completed_at', { count: 'exact' });
  query = applySurveyFilters(query, filters);
  const { data, error, count } = await query
    .order('submitted_at', { ascending: false })
    .order('response_id')
    .range(offset, offset + pageSize - 1);
  assertQuery(error);
  return {
    total: count ?? 0,
    page,
    page_size: pageSize,
    filters: publicSurveyFilters(filters),
    population_view: M2_SURVEY_RESPONSE_VIEW,
    rows: data ?? [],
  };
}

function surveyAnswerLines(
  question: SurveyQuestion,
  rawAnswer: unknown,
  choiceFreeText: Record<string, string>,
) {
  if (rawAnswer === null || rawAnswer === undefined || rawAnswer === '') return [];
  if (question.kind === 'text' || question.kind === 'scale_1_5') {
    return [String(rawAnswer)];
  }
  const selected = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
  return selected.map((value) => {
    const choiceId = String(value);
    const label = question.choices?.find((choice) => choice.id === choiceId)?.text ?? choiceId;
    const detail = choiceFreeText?.[choiceId];
    return typeof detail === 'string' && detail ? `${label} — ${detail}` : label;
  });
}

async function surveyResponseDetail(
  admin: SupabaseClient,
  input: Record<string, unknown>,
) {
  const responseId = requiredUuid(input.response_id, 'response_id');
  const { data, error } = await admin
    .from(M2_SURVEY_RESPONSE_VIEW)
    .select('*')
    .eq('response_id', responseId)
    .maybeSingle();
  assertQuery(error);
  if (!data) throw new InvalidRequest('Survey response is unavailable.');
  const response = data as M2SurveyPopulationRow;
  const [sections, questions] = await Promise.all([
    admin
      .from('lms_survey_sections')
      .select('*')
      .eq('lesson_id', response.survey_id)
      .order('position'),
    admin
      .from('lms_survey_questions')
      .select('*')
      .eq('lesson_id', response.survey_id),
  ]);
  assertQuery(sections.error);
  assertQuery(questions.error);
  const sectionById = new Map(
    ((sections.data ?? []) as SurveySection[]).map((section) => [section.id, section]),
  );
  const questionRows = (questions.data ?? []) as SurveyQuestion[];
  return {
    response_id: response.response_id,
    learner_email: response.learner_email,
    course_id: response.course_id,
    course_title: response.course_title,
    survey_id: response.survey_id,
    survey_title: response.survey_title,
    submitted_at: response.submitted_at,
    enrollment_status: response.enrollment_status,
    course_completed_at: response.course_completed_at,
    population_view: M2_SURVEY_RESPONSE_VIEW,
    path: response.path,
    sections: response.path.map((sectionId) => {
      const section = sectionById.get(sectionId);
      return {
        section_id: sectionId,
        position: section?.position ?? 0,
        title: section?.title ?? null,
        answers: questionRows
          .filter((question) => question.section_id === sectionId)
          .sort((left, right) => left.position - right.position)
          .map((question) => {
            const choiceFreeText = response.choice_free_text?.[question.id] ?? {};
            const rawAnswer = response.answers?.[question.id] ?? null;
            return {
              question_id: question.id,
              position: question.position,
              prompt: question.prompt,
              kind: question.kind,
              raw_answer: rawAnswer,
              answer_lines: surveyAnswerLines(question, rawAnswer, choiceFreeText),
              choice_free_text: choiceFreeText,
            };
          }),
      };
    }),
  };
}

async function allFilteredSurveyResponses(
  admin: SupabaseClient,
  filters: M2SurveyFilters,
) {
  const rows: M2SurveyPopulationRow[] = [];
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    let query = admin.from(M2_SURVEY_RESPONSE_VIEW).select('*');
    query = applySurveyFilters(query, filters);
    const { data, error } = await query
      .order('submitted_at', { ascending: false })
      .order('response_id')
      .range(offset, offset + batchSize - 1);
    assertQuery(error);
    const batch = (data ?? []) as M2SurveyPopulationRow[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return rows;
}

function surveyAnswerForCsv(
  question: SurveyQuestion,
  response: M2SurveyPopulationRow,
) {
  const value = response.answers?.[question.id];
  if (value === null || value === undefined) return '';
  if (question.kind === 'text' || question.kind === 'scale_1_5') return value;
  return surveyAnswerLines(
    question,
    value,
    response.choice_free_text?.[question.id] ?? {},
  );
}

async function exportM2SurveyResponses(
  admin: SupabaseClient,
  actorId: string,
  input: Record<string, unknown>,
) {
  const filters = surveyFilters(input);
  const responses = await allFilteredSurveyResponses(admin, filters);
  const responseSurveyIds = [...new Set(responses.map((response) => response.survey_id))];
  let definitionQuery = admin
    .from('lms_lessons')
    .select('id,title,module_id,position')
    .eq('kind', 'survey');
  let shouldLoadDefinitions = true;
  if (responseSurveyIds.length) {
    definitionQuery = definitionQuery.in('id', responseSurveyIds);
  } else if (filters.survey_id) {
    definitionQuery = definitionQuery.eq('id', filters.survey_id);
  } else if (filters.course_id) {
    const modules = await admin
      .from('lms_modules')
      .select('id')
      .eq('course_id', filters.course_id);
    assertQuery(modules.error);
    const moduleIds = (modules.data ?? []).map((module) => module.id);
    if (moduleIds.length) definitionQuery = definitionQuery.in('module_id', moduleIds);
    else shouldLoadDefinitions = false;
  }
  const surveyDefinitions: Array<{
    id: string;
    title: string;
    module_id: string;
    position: number;
  }> = [];
  if (shouldLoadDefinitions) {
    const definitions = await definitionQuery;
    assertQuery(definitions.error);
    surveyDefinitions.push(...((definitions.data ?? []) as typeof surveyDefinitions));
  }
  const definitionById = new Map(surveyDefinitions.map((survey) => [survey.id, survey]));
  const surveyIds = [...new Set([
    ...responseSurveyIds,
    ...surveyDefinitions.map((survey) => survey.id),
  ])];
  const [sections, questions] = surveyIds.length
    ? await Promise.all([
      admin.from('lms_survey_sections').select('*').in('lesson_id', surveyIds),
      admin.from('lms_survey_questions').select('*').in('lesson_id', surveyIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  assertQuery(sections.error);
  assertQuery(questions.error);
  const sectionRows = (sections.data ?? []) as SurveySection[];
  const sectionById = new Map(sectionRows.map((section) => [section.id, section]));
  const surveyById = new Map(responses.map((response) => [response.survey_id, response]));
  const questionRows = ((questions.data ?? []) as SurveyQuestion[]).sort((left, right) => {
    const leftSurvey = surveyById.get(left.lesson_id);
    const rightSurvey = surveyById.get(right.lesson_id);
    const leftDefinition = definitionById.get(left.lesson_id);
    const rightDefinition = definitionById.get(right.lesson_id);
    return (leftSurvey?.course_title ?? '').localeCompare(rightSurvey?.course_title ?? '')
      || (leftSurvey?.module_position ?? 0) - (rightSurvey?.module_position ?? 0)
      || (leftSurvey?.survey_position ?? leftDefinition?.position ?? 0)
        - (rightSurvey?.survey_position ?? rightDefinition?.position ?? 0)
      || (sectionById.get(left.section_id)?.position ?? 0) - (sectionById.get(right.section_id)?.position ?? 0)
      || left.position - right.position;
  });
  const headers = [
    'email',
    'submitted_at',
    'course',
    'survey',
    'enrollment_status',
    'course_completed_at',
    'path',
    ...questionRows.map((question) => {
      const survey = surveyById.get(question.lesson_id);
      const definition = definitionById.get(question.lesson_id);
      const section = sectionById.get(question.section_id);
      return `${survey?.survey_title ?? definition?.title ?? 'Survey'} — ${section?.title ?? `Section ${section?.position ?? ''}`} — ${question.prompt}`;
    }),
  ];
  const csvRows = responses.map((response) => [
    response.learner_email,
    response.submitted_at,
    response.course_title,
    response.survey_title,
    response.enrollment_status,
    response.course_completed_at,
    response.path.map((sectionId) => {
      const section = sectionById.get(sectionId);
      return section ? `§${section.position}${section.title ? ` ${section.title}` : ''}` : sectionId;
    }).join(' > '),
    ...questionRows.map((question) =>
      question.lesson_id === response.survey_id && response.path.includes(question.section_id)
        ? surveyAnswerForCsv(question, response)
        : ''
    ),
  ]);
  const csv = [headers, ...csvRows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  const namedFilters = {
    course_id: filters.course_id,
    survey_id: filters.survey_id,
    submitted_from: filters.submitted_from,
    submitted_to: filters.submitted_to,
  };
  await audit(admin, actorId, 'export_m2_survey_responses', {
    population_view: M2_SURVEY_RESPONSE_VIEW,
    filters: namedFilters,
    row_count: responses.length,
  });
  const courseSlug = filters.course_id && responses.length
    ? responses[0].course_slug
    : 'all-courses';
  return {
    file_name: `${courseSlug}-survey-responses.csv`,
    csv,
    row_count: responses.length,
    filters: publicSurveyFilters(filters),
  };
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

  // M1 §3 learner-file extensions: account state, support notes, and the
  // learner's slice of the audit trail. All service-role reads.
  const [{ data: authUser, error: authUserError }, notes, auditSlice] =
    await Promise.all([
      admin.auth.admin.getUserById(user.id),
      admin
        .from('lms_learner_notes')
        .select('id,author_email,body,created_at')
        .eq('learner_auth_user_id', user.id)
        .order('created_at', { ascending: false }),
      admin.rpc('lms_admin_search_audit', {
        p_actor_auth_user_id: actorId,
        p_target_email: normalized,
        p_limit: 100,
        // The learner file is an exact-target population, never a substring
        // match — ann@ must not surface joann@'s rows.
        p_target_exact: true,
      }),
    ]);
  if (authUserError) throw new Error(authUserError.message);
  assertQuery(notes.error);
  assertQuery(auditSlice.error);
  const bannedUntil =
    (authUser?.user as { banned_until?: string } | null)?.banned_until ?? null;

  // §3 completion panel: CE-report inclusion status per completion event.
  const completionIds = new Set((completions.data ?? []).map((row) => row.id));
  const reportedCompletionIds = new Set<string>();
  if (completionIds.size) {
    const { data: ceRuns, error: ceRunsError } = await admin
      .from('lms_ce_report_runs')
      .select('rows');
    assertQuery(ceRunsError);
    for (const run of ceRuns ?? []) {
      for (const row of (run.rows ?? []) as Array<{ completion_id?: string }>) {
        if (row.completion_id && completionIds.has(row.completion_id)) {
          reportedCompletionIds.add(row.completion_id);
        }
      }
    }
  }

  return {
    user: { id: user.id, email: user.email },
    account: {
      created_at: authUser?.user?.created_at ?? null,
      banned_until: bannedUntil,
      deactivated: Boolean(
        bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
      ),
    },
    profile: profile.data,
    enrollments: enrollments.data ?? [],
    progress: progress.data ?? [],
    attempts: attempts.data ?? [],
    surveyResponses: surveyResponses.data ?? [],
    completions: completions.data ?? [],
    summaries,
    notes: notes.data ?? [],
    auditSlice: auditSlice.data ?? { total: 0, rows: [] },
    ceReportedCompletionIds: [...reportedCompletionIds],
  };
}

// ---------------------------------------------------------------------------
// M1: learner management + operator dashboard
// ---------------------------------------------------------------------------

const LEARNER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Reversible sign-in block (M1 §4). Ten years, not a deletion of anything.
const DEACTIVATION_BAN = '87600h';

function requiredEmail(value: unknown, field: string) {
  const email = requiredString(value, field).toLowerCase();
  if (!LEARNER_EMAIL_PATTERN.test(email)) {
    throw new InvalidRequest(`${field} is invalid.`);
  }
  return email;
}

interface DirectoryFilters {
  p_search: string | null;
  p_course_id: string | null;
  p_enrollment_status: string | null;
  p_stalled: boolean;
  p_expiring_days: number | null;
  p_completed: boolean;
  p_completed_within_days: number | null;
  p_in_progress: boolean;
  p_deactivated: boolean;
  p_sort: string;
  p_dir: string;
}

function directoryFilters(payload: Record<string, unknown>): DirectoryFilters {
  return {
    p_search: optionalString(payload.search),
    p_course_id: optionalUuid(payload.course_id, 'course_id'),
    p_enrollment_status: optionalString(payload.status),
    p_stalled: payload.stalled === true,
    p_expiring_days: payload.expiring_days === undefined || payload.expiring_days === null || payload.expiring_days === ''
      ? null
      : asNumber(payload.expiring_days, 'expiring_days'),
    p_completed: payload.completed === true,
    p_completed_within_days: payload.completed_within_days === undefined || payload.completed_within_days === null || payload.completed_within_days === ''
      ? null
      : asNumber(payload.completed_within_days, 'completed_within_days'),
    p_in_progress: payload.in_progress === true,
    p_deactivated: payload.deactivated === true,
    p_sort: optionalString(payload.sort) ?? 'email',
    p_dir: optionalString(payload.dir) ?? 'asc',
  };
}

async function listLearners(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc('lms_admin_list_learners', {
    p_actor_auth_user_id: actorId,
    ...directoryFilters(payload),
    p_limit: asNumber(payload.limit ?? 25, 'limit'),
    p_offset: asNumber(payload.offset ?? 0, 'offset'),
  });
  assertQuery(error);
  return data;
}

async function dashboard(admin: SupabaseClient, actorId: string) {
  const { data, error } = await admin.rpc('lms_admin_dashboard_counts', {
    p_actor_auth_user_id: actorId,
  });
  assertQuery(error);
  await audit(admin, actorId, 'view_dashboard', {
    source: 'lms_admin_list_learners',
  });
  return data;
}

const LEARNER_CSV_HEADERS = [
  'email',
  'first_name',
  'middle_name',
  'last_name',
  'cfp_id',
  'account_state',
  'course',
  'enrollment_status',
  'percent_complete',
  'expires_at',
  'last_activity',
  'stalled',
  'completed',
  'latest_completed_at',
  'enrollment_count',
];

async function exportLearnersCsv(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const filters = directoryFilters(payload);
  const { data, error } = await admin.rpc('lms_admin_list_learners', {
    p_actor_auth_user_id: actorId,
    ...filters,
    p_limit: 10000,
    p_offset: 0,
  });
  assertQuery(error);
  const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;
  const csv = [
    LEARNER_CSV_HEADERS,
    ...rows.map((row) => [
      row.email,
      row.first_name,
      row.middle_name,
      row.last_name,
      row.cfp_id,
      row.deactivated ? 'deactivated' : 'active',
      row.course_title,
      row.enrollment_status,
      row.percent_complete,
      row.expires_at,
      row.last_activity,
      row.stalled,
      row.completed,
      row.latest_completed_at,
      row.enrollment_count,
    ]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  await audit(admin, actorId, 'export_learners_csv', {
    filters: { ...filters },
    row_count: rows.length,
  });
  return { file_name: 'learner-directory.csv', csv, row_count: rows.length };
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.rpc('lms_admin_find_auth_user_by_email', {
    p_email: email,
  });
  assertQuery(error);
  return data as { id: string; email: string } | null;
}

async function createLearner(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const email = requiredEmail(payload.email, 'email');
  const firstName = requiredString(payload.first_name, 'first_name');
  const lastName = requiredString(payload.last_name, 'last_name');
  const existing = await findAuthUserByEmail(admin, email);
  if (existing) throw new InvalidRequest('An account already exists for that email.');
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { lms_role: 'learner', lms_provisioned: true },
  });
  if (error || !created.user) {
    throw new Error(error?.message ?? 'Account creation failed.');
  }
  // The profile RPC audits this as create_learner in the same transaction.
  const { data: profile, error: profileError } = await admin.rpc(
    'lms_admin_upsert_learner_profile',
    {
      p_actor_auth_user_id: actorId,
      p_auth_user_id: created.user.id,
      p_first_name: firstName,
      p_middle_name: optionalString(payload.middle_name),
      p_last_name: lastName,
      p_cfp_id: optionalString(payload.cfp_id),
      p_audit_action: 'create_learner',
    },
  );
  if (profileError) {
    // Compensate: never leave an un-audited auth user behind if the audited
    // profile write (the create_learner record) failed.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    assertQuery(profileError);
  }
  return { auth_user_id: created.user.id, email, profile };
}

async function updateLearnerProfile(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc('lms_admin_upsert_learner_profile', {
    p_actor_auth_user_id: actorId,
    p_auth_user_id: requiredUuid(payload.auth_user_id, 'auth_user_id'),
    p_first_name: requiredString(payload.first_name, 'first_name'),
    p_middle_name: optionalString(payload.middle_name),
    p_last_name: requiredString(payload.last_name, 'last_name'),
    p_cfp_id: optionalString(payload.cfp_id),
  });
  assertQuery(error);
  return data;
}

async function sendPasswordReset(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const email = requiredEmail(payload.email, 'email');
  const user = await findAuthUserByEmail(admin, email);
  if (!user) throw new InvalidRequest('No account exists for that email.');
  const { error } = await admin.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
  // The response confirms dispatch only. No token or link is ever returned.
  await audit(admin, actorId, 'send_password_reset', {
    email,
    auth_user_id: user.id,
  });
  return { dispatched: true, email };
}

async function setAccountState(
  admin: SupabaseClient,
  actorId: string,
  action: 'deactivate_learner' | 'reactivate_learner',
  payload: Record<string, unknown>,
) {
  const userId = requiredUuid(payload.auth_user_id, 'auth_user_id');
  const { data: before, error: beforeError } =
    await admin.auth.admin.getUserById(userId);
  if (beforeError || !before.user) throw new InvalidRequest('Learner is unavailable.');
  if (before.user.app_metadata?.lms_role === 'operator') {
    throw new InvalidRequest('Operator accounts cannot be changed here.');
  }
  const { data: updated, error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: action === 'deactivate_learner' ? DEACTIVATION_BAN : 'none',
  });
  if (error || !updated.user) throw new Error(error?.message ?? 'Update failed.');
  const bannedUntil =
    (updated.user as { banned_until?: string }).banned_until ?? null;
  await audit(admin, actorId, action, {
    auth_user_id: userId,
    email: (before.user.email ?? '').toLowerCase(),
    old_banned_until:
      (before.user as { banned_until?: string }).banned_until ?? null,
    new_banned_until: bannedUntil,
  });
  return { auth_user_id: userId, banned_until: bannedUntil };
}

async function deleteLearner(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const userId = requiredUuid(payload.auth_user_id, 'auth_user_id');
  const confirmEmail = requiredEmail(payload.confirm_email, 'confirm_email');
  const { data: guard, error: guardError } = await admin.rpc(
    'lms_admin_delete_learner_guard',
    { p_actor_auth_user_id: actorId, p_auth_user_id: userId },
  );
  assertQuery(guardError);
  if (guard.email !== confirmEmail) {
    throw new InvalidRequest('Confirmation email does not match the learner.');
  }
  if (!guard.allowed) {
    throw new InvalidRequest(
      'This learner has completion or CE reporting records and cannot be deleted. Deactivate the account instead.',
    );
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  // auth.users cascades through enrollments, progress, attempts, surveys,
  // notes, and the profile per the platform FK graph.
  await audit(admin, actorId, 'delete_learner', {
    auth_user_id: userId,
    email: guard.email,
    enrollment_count: guard.enrollment_count,
  });
  return { deleted: true, email: guard.email };
}

async function grantEnrollment(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const email = requiredEmail(payload.email, 'email');
  const courseSlug = requiredString(payload.course_slug, 'course_slug');
  const expiresOn = requiredDate(payload.expires_at, 'expires_at');
  const expiresAt = `${expiresOn}T23:59:59Z`;
  const { data: course, error: courseError } = await admin
    .from('lms_courses')
    .select('id,title')
    .eq('slug', courseSlug)
    .maybeSingle();
  assertQuery(courseError);
  if (!course) throw new InvalidRequest('course_slug is invalid.');
  const { data: existing, error: existingError } = await admin
    .from('lms_enrollments')
    .select('id')
    .eq('person_email', email)
    .eq('course_id', course.id)
    .maybeSingle();
  assertQuery(existingError);
  if (existing) {
    throw new InvalidRequest(
      'An enrollment already exists for this learner and course. Use set expiration instead.',
    );
  }
  const { data, error } = await admin.rpc('lms_grant_enrollment', {
    p_email: email,
    p_course_slug: courseSlug,
    p_source: 'manual',
    p_expires_at: expiresAt,
    p_order_id: null,
  });
  assertQuery(error);
  const row = Array.isArray(data) ? data[0] : data;
  await audit(admin, actorId, 'grant_enrollment', {
    email,
    course_slug: courseSlug,
    expires_at: expiresAt,
    enrollment_id: row?.primary_enrollment_id ?? null,
    bonus_enrollment_granted: Boolean(row?.bonus_enrollment_id),
  });
  return row;
}

async function buildEnrollmentContext(
  admin: SupabaseClient,
  enrollmentId: string,
) {
  const { data: enrollment, error: enrollmentError } = await admin
    .from('lms_enrollments')
    .select('id,person_email,course_id,status,expires_at,terms_accepted_at')
    .eq('id', enrollmentId)
    .maybeSingle();
  assertQuery(enrollmentError);
  if (!enrollment) throw new InvalidRequest('Enrollment is unavailable.');
  const { data: course, error: courseError } = await admin
    .from('lms_courses')
    .select('id,status,progression,prerequisite_course_id,requires_terms_acceptance')
    .eq('id', enrollment.course_id)
    .single();
  assertQuery(courseError);
  const { data: modules, error: modulesError } = await admin
    .from('lms_modules')
    .select('id,course_id,position')
    .eq('course_id', course.id);
  assertQuery(modulesError);
  const moduleIds = (modules ?? []).map((item) => item.id);
  const [lessons, quizzes, progress, surveyResponses, attempts] =
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
        .from('lms_survey_responses')
        .select('enrollment_id,lesson_id')
        .eq('enrollment_id', enrollment.id),
      admin
        .from('lms_quiz_attempts')
        .select('quiz_id,attempt_number,passed')
        .eq('enrollment_id', enrollment.id),
    ]);
  assertQuery(lessons.error);
  assertQuery(quizzes.error);
  assertQuery(progress.error);
  assertQuery(surveyResponses.error);
  assertQuery(attempts.error);
  const context: ProgressionContext = {
    course,
    module: (modules ?? [])[0],
    modules: modules ?? [],
    lessons: lessons.data ?? [],
    quizzes: quizzes.data ?? [],
    progress: progress.data ?? [],
    surveyResponses: surveyResponses.data ?? [],
    attempts: attempts.data ?? [],
  };
  return { enrollment, context };
}

async function adminCompleteLesson(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  const enrollmentId = requiredUuid(payload.enrollment_id, 'enrollment_id');
  const lessonId = requiredUuid(payload.lesson_id, 'lesson_id');
  // The RPC validates course membership, refuses surveys, sets completed_at
  // only (video positions are never fabricated), and audits.
  const { data: progressRow, error } = await admin.rpc('lms_admin_complete_lesson', {
    p_actor_auth_user_id: actorId,
    p_enrollment_id: enrollmentId,
    p_lesson_id: lessonId,
  });
  assertQuery(error);
  // Engine path: re-evaluate course completion exactly as the learner-side
  // detector does, so downstream unlock and completion state stays derived.
  const { context } = await buildEnrollmentContext(admin, enrollmentId);
  let completionFired = false;
  if (courseComplete(
    context.course,
    context.modules,
    context.lessons,
    context.quizzes,
    context.progress,
    context.attempts,
    context.surveyResponses,
  )) {
    const { data: inserted, error: completionError } = await admin
      .from('lms_completion_events')
      .insert({
        enrollment_id: enrollmentId,
        completed_at: new Date().toISOString(),
        trigger: 'all_requirements_met',
        processed_at: null,
        designation_issued: false,
      })
      .select('id')
      .single();
    if (completionError?.code !== '23505') assertQuery(completionError);
    completionFired = Boolean(inserted);
    if (completionFired) {
      // The completion event is the most consequential record in the system;
      // when the admin path causes it, it gets its own audit row.
      await audit(admin, actorId, 'completion_event_recorded', {
        enrollment_id: enrollmentId,
        completion_id: inserted?.id ?? null,
        trigger: 'all_requirements_met',
        via: 'admin_complete_lesson',
      });
    }
  }
  return { progress: progressRow, completion_fired: completionFired };
}

interface ImportRowInput {
  row_number: number;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  cfp_board_id: string | null;
  course: string;
  expiration: string;
}

interface ImportRejection {
  row_number: number;
  field: string;
  reason: string;
}

async function importLearners(
  admin: SupabaseClient,
  actorId: string,
  payload: Record<string, unknown>,
) {
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
    throw new InvalidRequest('rows is required.');
  }
  if (payload.rows.length > 1000) {
    throw new InvalidRequest('Import is limited to 1000 rows per file.');
  }
  const commit = payload.commit === true;

  const { data: courses, error: coursesError } = await admin
    .from('lms_courses')
    .select('id,slug,title,status');
  assertQuery(coursesError);
  const courseBySlug = new Map(
    (courses ?? []).map((course) => [course.slug, course]),
  );

  const rejections: ImportRejection[] = [];
  const valid: ImportRowInput[] = [];
  const seenPairs = new Set<string>();

  for (const [index, raw] of payload.rows.entries()) {
    const rowNumber = index + 2; // data starts on line 2 of the CSV
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const reject = (field: string, reason: string) =>
      rejections.push({ row_number: rowNumber, field, reason });

    const emailRaw = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    if (!LEARNER_EMAIL_PATTERN.test(emailRaw)) {
      reject('email', 'must be a valid email address');
      continue;
    }
    const firstName = typeof row.first === 'string' ? row.first.trim() : '';
    const lastName = typeof row.last === 'string' ? row.last.trim() : '';
    if (!firstName) { reject('first', 'is required'); continue; }
    if (!lastName) { reject('last', 'is required'); continue; }
    const courseSlug = typeof row.course === 'string' ? row.course.trim().toLowerCase() : '';
    const course = courseBySlug.get(courseSlug);
    if (!course) { reject('course', 'unknown course slug'); continue; }
    const expiration = typeof row.expiration === 'string' ? row.expiration.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration) ||
      Number.isNaN(new Date(`${expiration}T00:00:00Z`).getTime())) {
      reject('expiration', 'must be a YYYY-MM-DD date');
      continue;
    }
    const pairKey = `${emailRaw}|${courseSlug}`;
    if (seenPairs.has(pairKey)) {
      reject('email', 'duplicates an earlier row for the same course');
      continue;
    }
    seenPairs.add(pairKey);

    const { data: existingEnrollment, error: enrollmentError } = await admin
      .from('lms_enrollments')
      .select('id')
      .eq('person_email', emailRaw)
      .eq('course_id', course.id)
      .maybeSingle();
    assertQuery(enrollmentError);
    if (existingEnrollment) {
      reject('course', 'already enrolled in this course');
      continue;
    }

    const existingUser = await findAuthUserByEmail(admin, emailRaw);
    if (existingUser) {
      const { data: profile, error: profileError } = await admin
        .from('lms_learner_profiles')
        .select('first_name,last_name')
        .eq('auth_user_id', existingUser.id)
        .maybeSingle();
      assertQuery(profileError);
      if (
        profile &&
        (profile.first_name || profile.last_name) &&
        (profile.first_name.toLowerCase() !== firstName.toLowerCase() ||
          profile.last_name.toLowerCase() !== lastName.toLowerCase())
      ) {
        reject('first', 'name conflicts with the existing profile for this email');
        continue;
      }
    }

    valid.push({
      row_number: rowNumber,
      email: emailRaw,
      first_name: firstName,
      middle_name: typeof row.middle === 'string' && row.middle.trim() ? row.middle.trim() : null,
      last_name: lastName,
      cfp_board_id: typeof row.cfp_board_id === 'string' && row.cfp_board_id.trim() ? row.cfp_board_id.trim() : null,
      course: courseSlug,
      expiration,
    });
  }

  if (!commit) {
    return {
      dry_run: true,
      valid_count: valid.length,
      rejected_count: rejections.length,
      valid_rows: valid,
      rejections,
    };
  }

  let accountsCreated = 0;
  let enrollmentsCreated = 0;
  const results: Array<{ row_number: number; email: string; enrollment_id: string | null }> = [];
  for (const row of valid) {
    let user = await findAuthUserByEmail(admin, row.email);
    let createdAccount = false;
    if (!user) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: row.email,
        email_confirm: true,
        app_metadata: { lms_role: 'learner', lms_provisioned: true },
      });
      if (error || !created.user) {
        rejections.push({ row_number: row.row_number, field: 'email', reason: 'account creation failed' });
        continue;
      }
      user = { id: created.user.id, email: row.email };
      createdAccount = true;
      accountsCreated += 1;
    }
    // Matched accounts are matched, not modified (§7): the profile is written
    // only for newly created accounts, or when the existing profile has no
    // names yet. Existing profile data — including CFP Board IDs and middle
    // names — is never overwritten by an import row.
    let writeProfile = createdAccount;
    if (!createdAccount) {
      const { data: existingProfile, error: existingProfileError } = await admin
        .from('lms_learner_profiles')
        .select('first_name,last_name')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      assertQuery(existingProfileError);
      writeProfile = !existingProfile ||
        (!existingProfile.first_name && !existingProfile.last_name);
    }
    if (writeProfile) {
      const { error: profileError } = await admin.rpc('lms_admin_upsert_learner_profile', {
        p_actor_auth_user_id: actorId,
        p_auth_user_id: user.id,
        p_first_name: row.first_name,
        p_middle_name: row.middle_name,
        p_last_name: row.last_name,
        p_cfp_id: row.cfp_board_id,
        p_audit_action: createdAccount ? 'create_learner' : 'update_learner_profile',
      });
      if (profileError) {
        if (createdAccount) {
          await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
          accountsCreated -= 1;
        }
        rejections.push({ row_number: row.row_number, field: 'first', reason: 'profile write failed' });
        continue;
      }
    }
    const { data: granted, error: grantError } = await admin.rpc('lms_grant_enrollment', {
      p_email: row.email,
      p_course_slug: row.course,
      p_source: 'manual',
      p_expires_at: `${row.expiration}T23:59:59Z`,
      p_order_id: null,
    });
    if (grantError) {
      rejections.push({ row_number: row.row_number, field: 'course', reason: 'enrollment grant failed' });
      continue;
    }
    const grantRow = Array.isArray(granted) ? granted[0] : granted;
    const enrollmentId = grantRow?.primary_enrollment_id ?? null;
    await audit(admin, actorId, 'grant_enrollment', {
      email: row.email,
      course_slug: row.course,
      expires_at: `${row.expiration}T23:59:59Z`,
      enrollment_id: enrollmentId,
      via: 'bulk_import',
    });
    enrollmentsCreated += 1;
    results.push({ row_number: row.row_number, email: row.email, enrollment_id: enrollmentId });
  }

  await audit(admin, actorId, 'bulk_import', {
    row_count: payload.rows.length,
    accounts_created: accountsCreated,
    enrollments_created: enrollmentsCreated,
    rejected_count: rejections.length,
  });

  return {
    dry_run: false,
    accounts_created: accountsCreated,
    enrollments_created: enrollmentsCreated,
    results,
    rejections,
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
      case 'quiz_analytics': data = await quizAnalytics(admin, payload); break;
      case 'list_survey_responses': data = await listSurveyResponses(admin, payload); break;
      case 'survey_response_detail': data = await surveyResponseDetail(admin, payload); break;
      case 'export_m2_survey_responses': data = await exportM2SurveyResponses(admin, actor.id, payload); break;
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
      case 'dashboard': data = await dashboard(admin, actor.id); break;
      case 'list_learners': data = await listLearners(admin, actor.id, payload); break;
      case 'export_learners_csv': data = await exportLearnersCsv(admin, actor.id, payload); break;
      case 'create_learner': data = await createLearner(admin, actor.id, payload); break;
      case 'update_learner_profile': data = await updateLearnerProfile(admin, actor.id, payload); break;
      case 'send_password_reset': data = await sendPasswordReset(admin, actor.id, payload); break;
      case 'deactivate_learner':
      case 'reactivate_learner':
        data = await setAccountState(admin, actor.id, action, payload);
        break;
      case 'delete_learner': data = await deleteLearner(admin, actor.id, payload); break;
      case 'grant_enrollment': data = await grantEnrollment(admin, actor.id, payload); break;
      case 'set_enrollment_expiration': {
        const expiresOn = requiredDate(payload.expires_at, 'expires_at');
        const { data: result, error } = await admin.rpc('lms_admin_set_enrollment_expiration', {
          p_actor_auth_user_id: actor.id,
          p_enrollment_id: requiredUuid(payload.enrollment_id, 'enrollment_id'),
          p_expires_at: `${expiresOn}T23:59:59Z`,
        });
        assertQuery(error);
        data = result;
        break;
      }
      case 'revoke_enrollment': {
        const { data: result, error } = await admin.rpc('lms_admin_revoke_enrollment', {
          p_actor_auth_user_id: actor.id,
          p_enrollment_id: requiredUuid(payload.enrollment_id, 'enrollment_id'),
        });
        assertQuery(error);
        data = result;
        break;
      }
      case 'admin_complete_lesson': data = await adminCompleteLesson(admin, actor.id, payload); break;
      case 'add_learner_note': {
        const { data: result, error } = await admin.rpc('lms_admin_add_learner_note', {
          p_actor_auth_user_id: actor.id,
          p_learner_auth_user_id: requiredUuid(payload.auth_user_id, 'auth_user_id'),
          p_body: requiredString(payload.body, 'body'),
        });
        assertQuery(error);
        data = result;
        break;
      }
      case 'import_learners': data = await importLearners(admin, actor.id, payload); break;
      case 'search_audit': {
        const { data: result, error } = await admin.rpc('lms_admin_search_audit', {
          p_actor_auth_user_id: actor.id,
          p_actor_email: optionalString(payload.actor_email),
          p_action: optionalString(payload.action),
          p_target_email: optionalString(payload.target_email),
          p_limit: asNumber(payload.limit ?? 50, 'limit'),
          p_offset: asNumber(payload.offset ?? 0, 'offset'),
        });
        assertQuery(error);
        data = result;
        break;
      }
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
