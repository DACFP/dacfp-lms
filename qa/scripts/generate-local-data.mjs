import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = fileURLToPath(new URL('../generated/', import.meta.url));
const DATASET_VERSION = 1;
const NAMESPACE = 'dacfp-lms-local-production-scale-v1';
const EPOCH = Date.parse('2026-07-17T12:00:00.000Z');
const DAY = 86_400_000;
const LEARNER_COUNT = 10_000;
const OPERATOR_COUNT = 2;
const RENEWAL_YEARS = [2024, 2025, 2026, 2027];

function uuid(label) {
  const bytes = createHash('sha256').update(`${NAMESPACE}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function iso(offsetMs = 0) {
  return new Date(EPOCH + offsetMs).toISOString();
}

function learnerEmail(index) {
  return `qa-learner-${String(index).padStart(5, '0')}@example.test`;
}

function operatorEmail(index) {
  return `qa-operator-${String(index).padStart(6, '0')}@example.test`;
}

function learnerState(index) {
  if (index <= 500) return 'terms_pending';
  if (index <= 3_000) return 'in_progress';
  if (index <= 5_000) return 'quiz_failed';
  if (index <= 7_000) return 'almost_done';
  if (index <= 8_000) return 'fpt_completed';
  if (index <= 8_500) return 'fully_complete';
  if (index <= 9_000) return 'expired';
  if (index <= 9_500) return 'revoked';
  return 'auth_only';
}

const courses = [
  {
    id: uuid('course:fpt'), slug: 'qa-fpt', title: 'Synthetic Financial Professional Track',
    description: 'Synthetic fourteen-module sequential program for local scale validation.',
    status: 'published', progression: 'sequential', prerequisite_course_id: null,
    ce_credits: 21, requires_terms_acceptance: true, created_at: iso(),
  },
  {
    id: uuid('course:bonus'), slug: 'qa-bonus', title: 'Synthetic Bonus Program',
    description: 'Synthetic open program unlocked by completion of the QA FPT course.',
    status: 'published', progression: 'open', prerequisite_course_id: uuid('course:fpt'),
    ce_credits: 3, requires_terms_acceptance: false, created_at: iso(1_000),
  },
  ...RENEWAL_YEARS.map((year, offset) => ({
    id: uuid(`course:renewal:${year}`), slug: `qa-renewal-${year}`,
    title: `Synthetic Renewal ${year}`,
    description: `Synthetic ${year} renewal course for local scale validation.`,
    status: year === 2027 ? 'draft' : year < 2026 ? 'archived' : 'published',
    progression: 'sequential', prerequisite_course_id: null, ce_credits: 1,
    requires_terms_acceptance: false, created_at: iso((offset + 2) * 1_000),
  })),
];

const modules = [
  ...Array.from({ length: 14 }, (_, offset) => ({
    id: uuid(`module:fpt:${offset + 1}`), course_id: uuid('course:fpt'), position: offset + 1,
    title: `Synthetic FPT Module ${String(offset + 1).padStart(2, '0')}`, ce_credits: 1.5,
  })),
  ...Array.from({ length: 6 }, (_, offset) => ({
    id: uuid(`module:bonus:${offset + 1}`), course_id: uuid('course:bonus'), position: offset + 1,
    title: `Synthetic Bonus Module ${String(offset + 1).padStart(2, '0')}`, ce_credits: 0.5,
  })),
  ...RENEWAL_YEARS.map((year) => ({
    id: uuid(`module:renewal:${year}:1`), course_id: uuid(`course:renewal:${year}`), position: 1,
    title: `Synthetic ${year} Annual Update`, ce_credits: 1,
  })),
];

function moduleKey(module) {
  if (module.course_id === uuid('course:fpt')) return `fpt:${module.position}`;
  if (module.course_id === uuid('course:bonus')) return `bonus:${module.position}`;
  const year = RENEWAL_YEARS.find((candidate) => module.course_id === uuid(`course:renewal:${candidate}`));
  return `renewal:${year}:1`;
}

const lessons = modules.flatMap((module) => {
  const key = moduleKey(module);
  const isFpt = module.course_id === uuid('course:fpt');
  const rows = [
    { position: 1, title: `${module.title}: Video`, kind: 'video', video_ref: 'placeholder/dacfp-lms-placeholder.mp4', duration_seconds: 4, body_md: null, is_required: true },
    { position: 2, title: `${module.title}: Reading`, kind: 'reading', video_ref: null, duration_seconds: null, body_md: 'Synthetic reading content for local production-scale validation.', is_required: true },
  ];
  if (isFpt) rows.push({ position: 3, title: `${module.title}: Optional reference`, kind: 'reading', video_ref: null, duration_seconds: null, body_md: 'Synthetic optional reference content.', is_required: false });
  return rows.map((row) => ({ id: uuid(`lesson:${key}:${row.position}`), module_id: module.id, ...row }));
});

const resources = modules.map((module) => {
  const key = moduleKey(module);
  return {
    id: uuid(`resource:${key}:1`), lesson_id: uuid(`lesson:${key}:2`), position: 1,
    title: `${module.title} synthetic notes`, file_ref: `seed/qa-${key.replaceAll(':', '-')}-notes.txt`,
  };
});

const quizModules = modules.filter((module) =>
  module.course_id === uuid('course:fpt') || RENEWAL_YEARS.some((year) => module.course_id === uuid(`course:renewal:${year}`)),
);
const quizzes = quizModules.map((module) => ({
  id: uuid(`quiz:${moduleKey(module)}`), module_id: module.id, question_count: 10, pass_pct: 70,
}));

async function writeRows(filename, rows) {
  const path = `${OUTPUT_DIR}${filename}`;
  const stream = createWriteStream(path, { encoding: 'utf8' });
  const hash = createHash('sha256');
  let count = 0;
  for await (const row of rows) {
    const line = `${JSON.stringify(row)}\n`;
    hash.update(line);
    count += 1;
    if (!stream.write(line)) await once(stream, 'drain');
  }
  stream.end();
  await once(stream, 'finish');
  return { count, sha256: hash.digest('hex') };
}

async function* authUsers() {
  for (let index = 1; index <= LEARNER_COUNT; index += 1) {
    yield {
      id: uuid(`auth:learner:${index}`), email: learnerEmail(index), encrypted_password: null,
      email_confirmed_at: null, raw_app_meta_data: { role: 'learner' },
      raw_user_meta_data: { display_name: `Synthetic Learner ${String(index).padStart(5, '0')}` },
      created_at: iso(index * 10), updated_at: iso(index * 10),
    };
  }
  for (let index = 1; index <= OPERATOR_COUNT; index += 1) {
    yield {
      id: uuid(`auth:operator:${index}`), email: operatorEmail(index), encrypted_password: null,
      email_confirmed_at: null, raw_app_meta_data: { role: 'operator' },
      raw_user_meta_data: { display_name: `Synthetic Operator ${index}` },
      created_at: iso((LEARNER_COUNT + index) * 10), updated_at: iso((LEARNER_COUNT + index) * 10),
    };
  }
}

async function* profiles() {
  for (let index = 1; index <= LEARNER_COUNT; index += 1) {
    const suffix = String(index).padStart(5, '0');
    yield {
      auth_user_id: uuid(`auth:learner:${index}`), display_name: `Synthetic Learner ${suffix}`,
      credential_ids: index % 10 === 0 ? { cfp: `SYNTH-CFP-${suffix}` } : {},
      created_at: iso(index * 10), updated_at: iso(index * 10),
    };
  }
}

function enrollmentStatus(index) {
  const state = learnerState(index);
  if (state === 'expired') return 'expired';
  if (state === 'revoked') return 'revoked';
  return 'active';
}

function enrollmentRow(index, courseSlug) {
  const status = enrollmentStatus(index);
  const email = learnerEmail(index);
  return {
    id: uuid(`enrollment:${index}:${courseSlug}`), person_email: email,
    auth_user_id: uuid(`auth:learner:${index}`), course_id: uuid(`course:${courseSlug}`),
    source: 'synthetic', enrolled_at: iso(index * 10 + 1_000),
    expires_at: status === 'expired' ? iso(-30 * DAY) : iso(365 * DAY), status,
    terms_accepted_at: courseSlug === 'fpt' && learnerState(index) !== 'terms_pending' ? iso(index * 10 + 2_000) : null,
    order_id: null,
  };
}

async function* enrollments() {
  for (let index = 1; index <= 9_500; index += 1) {
    yield enrollmentRow(index, 'fpt');
    yield enrollmentRow(index, 'bonus');
    if (index > 500 && index <= 8_500) yield enrollmentRow(index, 'renewal:2026');
  }
}

function completedProgress(index, courseSlug, lessonKey, ordinal) {
  const lesson = lessons.find((row) => row.id === uuid(`lesson:${lessonKey}`));
  const seconds = lesson?.kind === 'video' ? 4 : 0;
  return {
    id: uuid(`progress:${index}:${courseSlug}:${lessonKey}`),
    enrollment_id: uuid(`enrollment:${index}:${courseSlug}`), lesson_id: uuid(`lesson:${lessonKey}`),
    started_at: iso(index * 10 + ordinal * 1_000), completed_at: iso(index * 10 + ordinal * 1_000 + 500),
    last_position_seconds: seconds, max_watched_seconds: seconds,
    max_watched_updated_at: iso(index * 10 + ordinal * 1_000 + 500), updated_at: iso(index * 10 + ordinal * 1_000 + 500),
  };
}

function* requiredProgress(index, courseSlug, moduleCount, startOrdinal = 1) {
  for (let modulePosition = 1; modulePosition <= moduleCount; modulePosition += 1) {
    for (let lessonPosition = 1; lessonPosition <= 2; lessonPosition += 1) {
      const lessonKey = courseSlug === 'renewal:2026' ? 'renewal:2026:1:'.concat(lessonPosition) : `${courseSlug}:${modulePosition}:${lessonPosition}`;
      yield completedProgress(index, courseSlug, lessonKey, startOrdinal + ((modulePosition - 1) * 2) + lessonPosition - 1);
    }
  }
}

async function* progressRows() {
  for (let index = 1; index <= LEARNER_COUNT; index += 1) {
    const state = learnerState(index);
    if (state === 'in_progress') {
      yield* requiredProgress(index, 'fpt', 4);
      yield {
        id: uuid(`progress:${index}:fpt:fpt:5:1`), enrollment_id: uuid(`enrollment:${index}:fpt`),
        lesson_id: uuid('lesson:fpt:5:1'), started_at: iso(index * 10 + 10_000), completed_at: null,
        last_position_seconds: 2, max_watched_seconds: 2, max_watched_updated_at: iso(index * 10 + 10_500), updated_at: iso(index * 10 + 10_500),
      };
    } else if (state === 'quiz_failed') yield* requiredProgress(index, 'fpt', 8);
    else if (state === 'almost_done' || state === 'fpt_completed') yield* requiredProgress(index, 'fpt', 14);
    else if (state === 'fully_complete') {
      yield* requiredProgress(index, 'fpt', 14);
      yield* requiredProgress(index, 'bonus', 6, 29);
      yield* requiredProgress(index, 'renewal:2026', 1, 41);
    } else if (state === 'expired') yield* requiredProgress(index, 'fpt', 2);
  }
}

function attemptRow(index, courseSlug, quizKey, attemptNumber, score) {
  const passed = score >= 7;
  const submittedOffset = (attemptNumber * 100) + score;
  return {
    id: uuid(`attempt:${index}:${courseSlug}:${quizKey}:${attemptNumber}`),
    enrollment_id: uuid(`enrollment:${index}:${courseSlug}`), quiz_id: uuid(`quiz:${quizKey}`), attempt_number: attemptNumber,
    started_at: iso(index * 10 + submittedOffset * 1_000), submitted_at: iso(index * 10 + (submittedOffset + 1) * 1_000),
    answers: {}, score, passed,
  };
}

function* passingFptAttempts(index, throughModule) {
  for (let modulePosition = 1; modulePosition <= throughModule; modulePosition += 1) {
    yield attemptRow(index, 'fpt', `fpt:${modulePosition}`, 1, modulePosition % 2 === 0 ? 7 : 8);
  }
}

async function* attempts() {
  for (let index = 1; index <= LEARNER_COUNT; index += 1) {
    const state = learnerState(index);
    if (state === 'in_progress') yield* passingFptAttempts(index, 3);
    else if (state === 'quiz_failed') {
      yield* passingFptAttempts(index, 7);
      yield attemptRow(index, 'fpt', 'fpt:8', 1, 6);
      yield attemptRow(index, 'fpt', 'fpt:8', 2, 5);
      yield attemptRow(index, 'fpt', 'fpt:8', 3, 6);
    } else if (state === 'almost_done') yield* passingFptAttempts(index, 13);
    else if (state === 'fpt_completed') yield* passingFptAttempts(index, 14);
    else if (state === 'fully_complete') {
      yield* passingFptAttempts(index, 14);
      yield attemptRow(index, 'renewal:2026', 'renewal:2026:1', 1, 8);
    } else if (state === 'expired') yield* passingFptAttempts(index, 1);
  }
}

function completionRow(index, courseSlug, trigger = 'all_requirements_met') {
  return {
    id: uuid(`completion:${index}:${courseSlug}`), enrollment_id: uuid(`enrollment:${index}:${courseSlug}`),
    completed_at: iso(index * 10 + 60_000), trigger, processed_at: null, designation_issued: false,
  };
}

async function* completions() {
  for (let index = 7_001; index <= 8_500; index += 1) yield completionRow(index, 'fpt');
  for (let index = 8_001; index <= 8_500; index += 1) {
    yield completionRow(index, 'bonus');
    yield completionRow(index, 'renewal:2026');
  }
}

async function* questions() {
  for (const quiz of quizzes) {
    for (let position = 1; position <= 10; position += 1) {
      const correct = position % 10 === 0 ? ['a', 'c'] : ['a'];
      yield {
        id: uuid(`question:${quiz.id}:${position}`), quiz_id: quiz.id, position,
        prompt: `Synthetic question ${position} for local scale validation?`,
        choices: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Synthetic choice ${id.toUpperCase()}` })),
        correct, points: 1,
      };
    }
  }
}

async function* adminActions() {
  const actions = ['create_course', 'update_course', 'create_module', 'create_lesson', 'import_question_bank'];
  for (let index = 1; index <= 1_000; index += 1) {
    yield {
      id: uuid(`admin-action:${index}`), actor_auth_user_id: uuid(`auth:operator:${((index - 1) % OPERATOR_COUNT) + 1}`),
      action: actions[(index - 1) % actions.length], target: { synthetic: true, sequence: index }, created_at: iso(index * 1_000),
    };
  }
}

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });

const files = {};
files['auth_users.ndjson'] = await writeRows('auth_users.ndjson', authUsers());
files['lms_learner_profiles.ndjson'] = await writeRows('lms_learner_profiles.ndjson', profiles());
files['lms_courses.ndjson'] = await writeRows('lms_courses.ndjson', courses);
files['lms_modules.ndjson'] = await writeRows('lms_modules.ndjson', modules);
files['lms_lessons.ndjson'] = await writeRows('lms_lessons.ndjson', lessons);
files['lms_lesson_resources.ndjson'] = await writeRows('lms_lesson_resources.ndjson', resources);
files['lms_module_quizzes.ndjson'] = await writeRows('lms_module_quizzes.ndjson', quizzes);
files['lms_quiz_questions.ndjson'] = await writeRows('lms_quiz_questions.ndjson', questions());
files['lms_enrollments.ndjson'] = await writeRows('lms_enrollments.ndjson', enrollments());
files['lms_lesson_progress.ndjson'] = await writeRows('lms_lesson_progress.ndjson', progressRows());
files['lms_quiz_attempts.ndjson'] = await writeRows('lms_quiz_attempts.ndjson', attempts());
files['lms_completion_events.ndjson'] = await writeRows('lms_completion_events.ndjson', completions());
files['lms_admin_actions.ndjson'] = await writeRows('lms_admin_actions.ndjson', adminActions());

const manifest = {
  dataset_version: DATASET_VERSION,
  namespace: NAMESPACE,
  generated_at: iso(),
  identity_domain: 'example.test',
  learner_count: LEARNER_COUNT,
  operator_count: OPERATOR_COUNT,
  persona_counts: {
    terms_pending: 500, in_progress: 2_500, quiz_failed: 2_000, almost_done: 2_000,
    fpt_completed: 1_000, fully_complete: 500, expired: 500, revoked: 500, auth_only: 500,
  },
  files,
};
await writeFile(`${OUTPUT_DIR}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

for (const [filename, result] of Object.entries(files)) {
  console.log(`${filename}: ${result.count} rows ${result.sha256}`);
}
console.log(`manifest.json: ${Object.keys(files).length} verified targets`);
