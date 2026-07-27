# DACFP-LMS — F4: INTEGRITY SHOULD-FIX BATCH (from Leg A1)

STATUS: Commit as F4-SPEC.md. One gated Codex session, branch
codex/f4-integrity, AFTER F3 merges. SPEC.md v3.2 Hard Rules govern.
A1 finding numbers (docs/audits/A1-AUDIT-REPORT.md) are the
authority for file:line detail and directed fixes. Fix exactly what
is named. Gate artifacts never contain the production ref literal.

## 1. A1-5 — question-bank interchange (LEAD ITEM: content-load blocker)
The real FPT bank contains 5-, 7-, and 10-choice questions the
current a–d importer rejects. Replace the interchange with a JSON
format matching the confidential bank artifact exactly:
{format:"dacfp-question-bank-v1", modules:{module_NN:{questions:
[{position,prompt,choices:[{id,text}],correct:[ids]}]}}} — import
accepts a single module's questions array (or the full file with a
module selector), export emits the same shape verbatim. Arbitrary
choice counts (2..12), multi-answer preserved, round-trip
byte-equality tested for a 7-choice and a multi-answer question.
Validation loud: unknown ids in correct[], empty correct[],
duplicate ids all reject with named errors. CSV import/export
retired (delete, or keep read-only export clearly marked legacy).
Client csv lib replaced accordingly; the two CSV writers issue
(A1-23) dissolves with it — the surviving CSV surface
(survey/response exports) adopts the hardened csvCell.

## 2. A1-4 — module deletion safety
moduleUnlocked becomes order-based (previous = preceding element of
position-sorted modules, not position-1 adjacency); delete_module
and delete_lesson renumber surviving siblings 1..N in the same
transaction. Engine tests: non-contiguous sequence (1,2,4), deleted
first module, deleted middle module mid-learner-progress. Engine
copies re-synced byte-identical; identity test green.

## 3. A1-7 — audit the four unaudited admin reads
inspect_learner (target: email), preview_ce_report (courses/period/
counts), list_ce_report_runs (count), export_question_bank (module/
quiz id) — all call audit() in-path; export_question_bank gets its
own action name. Evidence: one call each → four ledger rows.

## 4. A1-8 — survey-flow edits stop orphaning responses
lms_admin_replace_survey_flow matches incoming sections by id and
UPDATEs; deletes only genuinely-removed sections; REFUSES (named
error) to delete any section present in an existing response path
unless p_confirm_orphan := true is passed; the admin UI surfaces
that confirmation with a count of affected responses.

## 5. A1-18 — validation parity in the flow editor
Lift replace_survey_questions' choice validation (array, >=2, id/
text shape) into replace_survey_flow AND into the
lms_validate_survey_question_lesson trigger; missing section id →
400 not 500.

## 6. A1-13 — manual completions flagged in CE filings
Frozen row objects gain trigger; preview shows it; runs EXCLUDE
manual_admin completions unless include_manual := true (explicit
operator opt-in surfaced in the UI).

## 7. A1-22 — xlsx advisory remediation
Pin "xlsx" to the SheetJS CDN tarball (0.20.x) per their migration
doc; if the API drift is nontrivial, switch to exceljs (the code
needs read-template + write-cells only). npm audit must no longer
report the two xlsx HIGHs; export byte-shape test still green.

## 8. Small mediums/lows (one commit, individually cited)
A1-12: lms-playback-token returns review_mode; LessonPlayer consumes
it; the dead per-heartbeat derivation in lms-progress deleted.
A1-14: (landed in F3 — verify only.)
A1-15: surveyResults + exportSurveyResponses routed through
runMutationLifecycle.
A1-16: supabaseProvider adds explicit ownership filters (.eq
auth_user_id / .in enrollment_id) on all six learner tables; module/
lesson views stop refetching the full catalog per navigation.
A1-17: lessonComplete authoritative on completed_at for all kinds
(95% rule stays where the write happens); engine tests updated;
copies re-synced.
A1-20: signOut scope global.
A1-21: CE panel branches on course.cfp_program_id first ("CE
reporting for this course is not yet available"), reads saved
profile not form state.
A1-24: download anchor appended, revoke deferred.
A1-26: inspectLearner batched (course-scope fetch once, group in
memory).

## GATE (F4)
Numbered evidence per section: round-trip proofs (7-choice +
multi-answer byte-equality; loud-reject cases); non-contiguous
engine tests green + renumbering shown live; four audit rows;
orphan-refusal + confirmed-orphan flows; flow-editor rejection of
choiceless question; a manual completion excluded-then-included in
preview with trigger visible; npm audit before/after for xlsx;
review_mode wire proof; provider filter diff; suite green with
justified changes (engine identity test included); branch + hash.
