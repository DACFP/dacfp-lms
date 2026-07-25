# DACFP-LMS — SURVEYS SPEC (V1) — pre/post-course + post-module surveys

STATUS: Commit to repo root as V1-SPEC.md. Behavior-change session
(freeze does not apply). SPEC.md v3.1 Hard Rules 1–12 govern; this
spec requires the v3.2 amendment below to be committed FIRST. Runs
ONLY after X1 merges (touches the same module/lesson surfaces).

## 0. SPEC.md v3.2 AMENDMENT (Jack commits before the session)
1. Header: "SPEC v3.1" → "SPEC v3.2".
2. §2 lms_lessons kind check: ('video','reading') →
   ('video','reading','survey').
3. §3 courseComplete: append — "Required survey lessons count toward
   course completion but are EXCLUDED from quizAttemptable's
   required-lesson check: evaluations never gate the exam."

## 1. DATA MODEL (migration)
- lms_lessons.kind gains 'survey' (constraint per amendment).
- lms_survey_questions: id, lesson_id fk (kind='survey'), position,
  prompt text, kind check ('scale_1_5','text','single_choice',
  'multi_choice'), choices jsonb null, required bool default true.
  RLS: readable under active enrollment (same pattern as lessons);
  no learner writes.
- lms_survey_responses: id, enrollment_id fk, lesson_id fk,
  submitted_at, answers jsonb, unique(enrollment_id, lesson_id).
  RLS: insert/select own only (enrollment ownership pattern);
  responses immutable (no update policy).
- No answer keys exist; Hard Rule 4 unaffected.

## 2. ENGINE (per the v3.2 amendment, unit-tested)
- lessonComplete for kind='survey': complete when a response row
  exists for (enrollment, lesson).
- quizAttemptable: required-lesson check now filters OUT
  kind='survey'.
- courseComplete: unchanged formula over required lessons (surveys
  included by nature) + all quizzes. New tests: survey does not gate
  quiz; missing required survey blocks completion; optional survey
  blocks nothing; response idempotency.

## 3. LEARNER UI
- Survey lesson page: renders questions by kind (1–5 scale as radio
  row, text area, single/multi choice), required markers, one
  submit → completes the lesson, then prev/next as any lesson.
  Submitted state: read-only view of their answers.
- Module page: survey lessons listed with a "Survey" tag; copy makes
  clear they don't gate the quiz but are required to finish the
  course (when required).
- Dashboard completion math naturally includes them (no change).

## 4. ADMIN
- Lesson CRUD supports kind='survey'; survey-question editor
  (add/edit/reorder/kind/choices/required) in the module editor;
  audited like all mutations.
- Learner inspector shows survey submission status.
- SURVEY RESULTS (first-class): a per-survey results view — response
  count, completion rate among enrolled, per-question breakdowns
  (scale questions: distribution + average; choice questions: counts
  per option; text questions: the response list) — plus BULK EXPORT:
  one click downloads all responses for a survey (or every survey in
  a course) as CSV, one row per learner response with email,
  submitted_at, and one column per question (flattened answers).
  Export goes through lms-admin (operator-gated, audited) like every
  admin read of member data. CSV shape must be clean enough to hand
  directly to an analyst.

## 5. SEED (placeholder content, synthetic)
- FPT Sandbox gains: an "Introduction" module (position 0) with a
  short placeholder video + required pre-course survey (3 placeholder
  questions across kinds); a required post-module survey appended to
  module 1 (2 questions); a required post-course survey as the final
  lesson of the last module (3 questions). Real questions arrive at
  content load; structure is the deliverable.
- Verify sequential unlock still behaves with the Introduction
  module in position 0 (it becomes the first gate).

## 6. GATE (V1)
Migration SQL in full; engine diff + new test output; RLS proofs on
both new tables (own-rows, immutability of responses, anon zero);
wet run: fresh learner completes intro survey → module 1 unlocks
path unchanged → quiz attemptable WITHOUT post-module survey →
course completion BLOCKED until required surveys submitted → then
completes; admin question-editor round trip; RESULTS PROOF: with two
synthetic learners' responses staged, the results view shows correct
distributions and the bulk CSV export opens clean in a spreadsheet
(paste the CSV); export action appears in lms_admin_actions;
suite green; pushed branch + hash.
