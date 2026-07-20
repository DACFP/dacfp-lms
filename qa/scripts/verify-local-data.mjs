import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = fileURLToPath(new URL('../generated/', import.meta.url));
const EXPECTED_COUNTS = {
  'auth_users.ndjson': 10_002,
  'lms_learner_profiles.ndjson': 10_000,
  'lms_courses.ndjson': 6,
  'lms_modules.ndjson': 24,
  'lms_lessons.ndjson': 62,
  'lms_lesson_resources.ndjson': 24,
  'lms_module_quizzes.ndjson': 18,
  'lms_quiz_questions.ndjson': 180,
  'lms_enrollments.ndjson': 27_000,
  'lms_lesson_progress.ndjson': 161_500,
  'lms_quiz_attempts.ndjson': 75_500,
  'lms_completion_events.ndjson': 2_500,
  'lms_admin_actions.ndjson': 1_000,
};
const LEARNER_EMAIL = /^qa-learner-(?:0[0-9]{4}|10000)@example\.test$/;
const OPERATOR_EMAIL = /^qa-operator-00000[12]@example\.test$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readRows(filename, visit = () => {}) {
  const path = `${OUTPUT_DIR}${filename}`;
  const input = createReadStream(path);
  const hash = createHash('sha256');
  input.on('data', (chunk) => hash.update(chunk));
  const lines = createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  const ids = new Set();
  for await (const line of lines) {
    assert(line.length > 0, `${filename} contains a blank record`);
    const row = JSON.parse(line);
    count += 1;
    if (row.id) {
      assert(UUID.test(row.id), `${filename} has invalid UUID ${row.id}`);
      assert(!ids.has(row.id), `${filename} has duplicate id ${row.id}`);
      ids.add(row.id);
    }
    visit(row, count);
  }
  return { count, sha256: hash.digest('hex') };
}

const manifest = JSON.parse(await readFile(`${OUTPUT_DIR}manifest.json`, 'utf8'));
assert(manifest.dataset_version === 1, 'Unexpected dataset version');
assert(manifest.namespace === 'dacfp-lms-local-production-scale-v1', 'Unexpected namespace');
assert(manifest.identity_domain === 'example.test', 'Unexpected identity domain');
assert(manifest.learner_count === 10_000 && manifest.operator_count === 2, 'Unexpected identity counts');
assert(JSON.stringify(manifest.persona_counts) === JSON.stringify({
  terms_pending: 500, in_progress: 2_500, quiz_failed: 2_000, almost_done: 2_000,
  fpt_completed: 1_000, fully_complete: 500, expired: 500, revoked: 500, auth_only: 500,
}), 'Unexpected persona distribution');

const authUsers = new Map();
let learnerRoles = 0;
let operatorRoles = 0;
const authResult = await readRows('auth_users.ndjson', (row) => {
  assert(row.encrypted_password === null, `Password material present for ${row.email}`);
  const role = row.raw_app_meta_data?.role;
  if (role === 'learner') {
    learnerRoles += 1;
    assert(LEARNER_EMAIL.test(row.email), `Disallowed learner identity ${row.email}`);
  } else if (role === 'operator') {
    operatorRoles += 1;
    assert(OPERATOR_EMAIL.test(row.email), `Disallowed operator identity ${row.email}`);
  } else throw new Error(`Disallowed app_metadata role ${role}`);
  authUsers.set(row.id, row);
});
assert(learnerRoles === 10_000 && operatorRoles === 2, 'Role totals do not match manifest');

const learnerIds = new Set();
const profileResult = await readRows('lms_learner_profiles.ndjson', (row) => {
  assert(authUsers.get(row.auth_user_id)?.raw_app_meta_data?.role === 'learner', `Profile is not bound to a learner ${row.auth_user_id}`);
  assert(!learnerIds.has(row.auth_user_id), `Duplicate learner profile ${row.auth_user_id}`);
  learnerIds.add(row.auth_user_id);
  for (const credential of Object.values(row.credential_ids)) assert(/^SYNTH-/.test(credential), `Unsanitized credential ${credential}`);
});

const courseIds = new Set();
const courseSlugs = new Set();
const courseResult = await readRows('lms_courses.ndjson', (row) => {
  courseIds.add(row.id);
  courseSlugs.add(row.slug);
  assert(['draft', 'published', 'archived'].includes(row.status), `Invalid course status ${row.status}`);
  assert(['sequential', 'open'].includes(row.progression), `Invalid progression ${row.progression}`);
});
assert(courseSlugs.has('qa-fpt') && courseSlugs.has('qa-bonus'), 'FPT or Bonus course missing');
for (const year of [2024, 2025, 2026, 2027]) assert(courseSlugs.has(`qa-renewal-${year}`), `Renewal ${year} missing`);

const moduleIds = new Set();
const moduleCounts = new Map();
const moduleResult = await readRows('lms_modules.ndjson', (row) => {
  assert(courseIds.has(row.course_id), `Module references missing course ${row.course_id}`);
  moduleIds.add(row.id);
  moduleCounts.set(row.course_id, (moduleCounts.get(row.course_id) ?? 0) + 1);
});
assert([...moduleCounts.values()].sort((a, b) => b - a).join(',') === '14,6,1,1,1,1', 'Module distribution is not 14/6/1/1/1/1');

const lessonIds = new Set();
const lessonResult = await readRows('lms_lessons.ndjson', (row) => {
  assert(moduleIds.has(row.module_id), `Lesson references missing module ${row.module_id}`);
  lessonIds.add(row.id);
  if (row.kind === 'video') {
    assert(row.video_ref === 'placeholder/dacfp-lms-placeholder.mp4', `Unexpected video path ${row.video_ref}`);
    assert(row.duration_seconds === 4, `Unexpected placeholder duration ${row.duration_seconds}`);
  } else assert(row.kind === 'reading', `Invalid lesson kind ${row.kind}`);
});

const resourceIds = new Set();
const resourceResult = await readRows('lms_lesson_resources.ndjson', (row) => {
  assert(lessonIds.has(row.lesson_id), `Resource references missing lesson ${row.lesson_id}`);
  assert(row.file_ref.startsWith('seed/qa-'), `Unsafe resource path ${row.file_ref}`);
  resourceIds.add(row.id);
});

const quizIds = new Set();
const quizResult = await readRows('lms_module_quizzes.ndjson', (row) => {
  assert(moduleIds.has(row.module_id), `Quiz references missing module ${row.module_id}`);
  assert(row.question_count === 10 && row.pass_pct === 70, `Quiz policy drift for ${row.id}`);
  quizIds.add(row.id);
});

const questionsPerQuiz = new Map();
const questionResult = await readRows('lms_quiz_questions.ndjson', (row) => {
  assert(quizIds.has(row.quiz_id), `Question references missing quiz ${row.quiz_id}`);
  assert(Array.isArray(row.correct) && [1, 2].includes(row.correct.length), `Invalid answer-key cardinality ${row.id}`);
  questionsPerQuiz.set(row.quiz_id, (questionsPerQuiz.get(row.quiz_id) ?? 0) + 1);
});
assert([...questionsPerQuiz.values()].every((count) => count === 10), 'Every quiz must have exactly ten questions');

const enrollmentIds = new Set();
const enrollmentCoursePairs = new Set();
const enrollmentStatuses = { active: 0, expired: 0, revoked: 0 };
const enrollmentResult = await readRows('lms_enrollments.ndjson', (row) => {
  assert(LEARNER_EMAIL.test(row.person_email), `Disallowed enrollment identity ${row.person_email}`);
  assert(authUsers.get(row.auth_user_id)?.email === row.person_email, `Enrollment identity mismatch ${row.id}`);
  assert(courseIds.has(row.course_id), `Enrollment references missing course ${row.course_id}`);
  assert(row.source === 'synthetic' && row.order_id === null, `Unsafe enrollment provenance ${row.id}`);
  assert(row.status in enrollmentStatuses, `Invalid enrollment status ${row.status}`);
  enrollmentStatuses[row.status] += 1;
  const pair = `${row.auth_user_id}:${row.course_id}`;
  assert(!enrollmentCoursePairs.has(pair), `Duplicate learner/course enrollment ${pair}`);
  enrollmentCoursePairs.add(pair);
  enrollmentIds.add(row.id);
});
assert(JSON.stringify(enrollmentStatuses) === JSON.stringify({ active: 25_000, expired: 1_000, revoked: 1_000 }), 'Enrollment status distribution drift');

const progressResult = await readRows('lms_lesson_progress.ndjson', (row) => {
  assert(enrollmentIds.has(row.enrollment_id), `Progress references missing enrollment ${row.enrollment_id}`);
  assert(lessonIds.has(row.lesson_id), `Progress references missing lesson ${row.lesson_id}`);
  assert(row.max_watched_seconds >= row.last_position_seconds, `Non-monotonic progress fixture ${row.id}`);
});

const attemptKeys = new Set();
const attemptResult = await readRows('lms_quiz_attempts.ndjson', (row) => {
  assert(enrollmentIds.has(row.enrollment_id), `Attempt references missing enrollment ${row.enrollment_id}`);
  assert(quizIds.has(row.quiz_id), `Attempt references missing quiz ${row.quiz_id}`);
  assert(row.passed === (row.score >= 7), `70 percent boundary drift ${row.id}`);
  const key = `${row.enrollment_id}:${row.quiz_id}:${row.attempt_number}`;
  assert(!attemptKeys.has(key), `Duplicate attempt number ${key}`);
  attemptKeys.add(key);
});

const completionEnrollments = new Set();
const completionResult = await readRows('lms_completion_events.ndjson', (row) => {
  assert(enrollmentIds.has(row.enrollment_id), `Completion references missing enrollment ${row.enrollment_id}`);
  assert(!completionEnrollments.has(row.enrollment_id), `Duplicate completion for enrollment ${row.enrollment_id}`);
  completionEnrollments.add(row.enrollment_id);
});

const adminResult = await readRows('lms_admin_actions.ndjson', (row) => {
  assert(authUsers.get(row.actor_auth_user_id)?.raw_app_meta_data?.role === 'operator', `Admin action actor is not an operator ${row.id}`);
  assert(row.target?.synthetic === true, `Admin action is not marked synthetic ${row.id}`);
});

const results = {
  'auth_users.ndjson': authResult,
  'lms_learner_profiles.ndjson': profileResult,
  'lms_courses.ndjson': courseResult,
  'lms_modules.ndjson': moduleResult,
  'lms_lessons.ndjson': lessonResult,
  'lms_lesson_resources.ndjson': resourceResult,
  'lms_module_quizzes.ndjson': quizResult,
  'lms_quiz_questions.ndjson': questionResult,
  'lms_enrollments.ndjson': enrollmentResult,
  'lms_lesson_progress.ndjson': progressResult,
  'lms_quiz_attempts.ndjson': attemptResult,
  'lms_completion_events.ndjson': completionResult,
  'lms_admin_actions.ndjson': adminResult,
};

assert(Object.keys(manifest.files).sort().join(',') === Object.keys(EXPECTED_COUNTS).sort().join(','), 'Manifest file set drift');
for (const [filename, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
  const result = results[filename];
  assert(result.count === expectedCount, `${filename}: expected ${expectedCount}, received ${result.count}`);
  assert(manifest.files[filename]?.count === expectedCount, `${filename}: manifest count drift`);
  assert(manifest.files[filename]?.sha256 === result.sha256, `${filename}: SHA-256 mismatch`);
  console.log(`PASS ${filename}: ${result.count} rows ${result.sha256}`);
}
console.log('PASS identities: 10,000 learners and 2 operators, all @example.test, no passwords');
console.log('PASS invariants: foreign keys, uniqueness, roles, provenance, policy, progress, and completion checks');
