# LEG A1 — ADVERSARIAL CODEBASE AUDIT · FINDINGS REPORT

**Repository:** DACFP/dacfp-lms
**Commit:** `138cb90` (main, clean tree)
**Scope:** full-tree, nothing grandfathered
**Mode:** READ-ONLY
**Attestation:** `[SUPABASE: NONE | calls: 0]`

---

## Method

All 16 migrations, all 7 edge functions, and all 44 `src/` modules read in full. `npm run test` (24 files / 198 tests, green, 22.9s), `npm run build` (clean), and `npm audit` executed locally. No Supabase connection was made at any point — every RLS, grant, policy and trigger claim below is derived from migration source, which is why Leg A2 must confirm the live catalog matches. No files were edited.

## F-series regression archaeology — verdict: the remediations survived

| Finding | Status | Evidence |
|---|---|---|
| H-1 completion detector on lesson path | intact | `lms-progress/index.ts:198-232` |
| H-2 / H-3 player lifecycle | intact | `src/pages/LessonPage.tsx:194` — `key={lesson.id}` present |
| H-8 server-stamped terms | intact | `lms_accept_terms` + grant revoked, `f1:7-67` |
| M-2 atomic admin audit | intact | `lms_admin_crud`, `f1:280-491` |
| M-3 signed-URL TTL 21600s | intact | `lms-playback-token/index.ts:11` |
| M-4 plausibility clock anchor | intact **and improved** by X1 | `x1:186-208` |
| M-5 unmount guards, queued trailing heartbeat | intact | `LessonPlayer.tsx:72-124,169-185` |
| M-9 pass_pct / question_count CHECKs | intact | `f1:1-5` |
| N-6 engine byte-identity test | intact **and extended** to `routing.ts` | `engine-identity.test.ts`, `routing-identity.test.ts` |
| L-1 answer-key tripwire | intact | `supabaseProvider.ts:214-222` — `hasOwnProperty('correct')` |

**Hard Rule 4 holds.** `buildPublicQuestions` strips `correct` by destructuring; no learner-reachable path exposes it.

**Hard Rule 1 holds in the working tree.** The only Supabase ref present is the sandbox, in 4 expected files. Zero trace of the production ref (Hard Rule 1).

Nine sessions of accretion since F2 have, however, re-opened one hole F1 closed, and added two new classes.

---

# CRITICAL

## A1-1 · The `auth.users` role trigger clobbers the shared role model

**`supabase/migrations/20260716195228_lms_auth_foundation.sql:35-56`** (+ `20260716224000_lms_admin.sql:47-60`)

`lms_stamp_learner_role()` runs `jsonb_set(coalesce(raw_app_meta_data,'{}'), '{role}', '"learner"', true)` — `create_missing=true` **overwrites an existing `role` key** — and its trigger is `before insert on auth.users for each row` with no `WHEN` clause and no filter.

### Failure narrative

Promotion puts this trigger on the production `auth.users` shared with the command center. Every command-center user created afterwards has `raw_app_meta_data.role` rewritten to `"learner"`, destroying whatever role the command center set at insert. PostgreSQL fires BEFORE-INSERT triggers in **alphabetical trigger-name order**, so `lms_auth_user_stamp_learner_role` runs after any `cbda_*`-named trigger and wins. The failure is silent: the row inserts successfully with the wrong role.

Symmetrically, `lms_admin_actor_is_operator` reads that same unnamespaced `raw_app_meta_data->>'role'` — if the command center ever uses `role='operator'` for its own meaning, those accounts silently acquire full authority over the entire `lms_admin_*` RPC family (CRUD, `manual_mark_complete`, learner PII, CE exports).

The second trigger, `lms_auth_user_create_learner_profile` (AFTER INSERT, also unfiltered), writes an `lms_learner_profiles` row for every command-center staff account.

### Directed fix

1. Namespace the claim: write `lms_role` instead of `role`, and update `lms_admin_actor_is_operator`, `toRole()` in `src/data/supabaseProvider.ts:91`, and the operator seeding.
2. Make the stamp non-destructive regardless: only set when `new.raw_app_meta_data->>'lms_role' is null`.
3. Add a `WHEN` clause to both triggers so they fire only for LMS-provisioned users (e.g. a marker written by `lms_grant_enrollment` / the signup flow), leaving command-center inserts untouched.

---

# HIGH

## A1-2 · Learners can insert survey responses directly, bypassing every server validation

**`supabase/migrations/20260725090000_v1_surveys.sql:109` and `:139-157`**

`grant select, insert on public.lms_survey_responses to authenticated` plus policy `lms_survey_responses_insert_own` are live and were **never revoked** — while the structurally identical quiz-attempt hole *was* closed by `20260716213218_lms_quiz_attempt_write_rider.sql:1-6`.

### Exploit

A learner reads their own `enrollment_id` (`lms_enrollments_select_own`) and the survey's first `section_id` (`lms_survey_sections_select_accessible`, granted to authenticated), then:

```http
POST /rest/v1/lms_survey_responses
{"enrollment_id":"<own>","lesson_id":"<survey lesson>","answers":{},"path":["<first section id>"]}
```

This satisfies the insert policy and every check in `lms_validate_survey_response_lesson` — `answers` only has to be a JSON object, and `{}` qualifies. `normalizeRoutedSubmission` never runs.

Consequences:

1. V1b §2's "every required question in every traversed section" is bypassed entirely and the survey lesson counts complete, feeding `courseComplete` → completion event → CE credit.
2. Because responses are immutable and uniquely keyed, the learner can *never* submit a real response afterwards — `lms-submit-survey` returns `already_submitted:true` forever.
3. `answers` is unbounded and unkeyed on this path, so any authenticated user can write arbitrarily large jsonb into the shared production database.
4. Forged `path` arrays that the routing engine could never produce poison `path_distribution` and the analyst CSV.

### Directed fix

Mirror the F1 rider exactly:

```sql
revoke insert on public.lms_survey_responses from authenticated;
drop policy lms_survey_responses_insert_own on public.lms_survey_responses;
```

`lms-submit-survey` uses `serviceClient()` and needs neither. Retain the `select` grant and `lms_survey_responses_select_own`.

---

## A1-3 · CE preview and CE export are two independent implementations — the operator approves list A and files list B

**`supabase/functions/lms-admin/index.ts:693-830` (TypeScript) vs `supabase/migrations/20260727160000_r1_ce_reporting.sql:484-529` (SQL)**

`previewCeReport` and `lms_admin_create_ce_report_run` re-implement the same selection independently, and `exportRun` at `src/pages/CeReportingPage.tsx:132` creates the run from a **fresh server-side query**, not from the previewed rows.

### Concrete divergences

- **Credential type.** TS requires `typeof profile.credential_ids?.cfp === 'string'` (line 759); SQL uses `->> 'cfp'`, which stringifies a JSON number. `credential_ids` is directly learner-writable (`grant update (credential_ids)`, `r1:7-19`) with only a `jsonb_typeof = 'object'` constraint — so `{"cfp": 12345}` lands in preview's **MISSING-ID** column and in the **exported filing**.
- **Row caps.** The TS completion query (line 706) has no course filter and no limit; the run-history query (line 717) and the nudge query (line 785) are likewise unbounded — all subject to PostgREST's max-rows (Supabase default 1000). The SQL uses full `not exists`. Past that threshold, preview silently under-reports while the export files the full set, and already-reported detection starts missing older runs → **duplicate CFP Board submissions**.
- **Silent drops.** Line 758 `if (!course?.cfp_program_id || !profile) continue` removes a completion from *all three* preview buckets. R1-SPEC §2 is explicit: MISSING-ID must be "listed with emails so they can be chased — **never silently dropped**." A completion whose learner has no profile row vanishes from the operator's view entirely.
- **Time-of-check/time-of-use.** Any learner who adds a CFP ID, or any completion that lands, between Preview and Export changes what is frozen and filed without the operator seeing it.

### Directed fix

One implementation. Add a read-only SQL function (`lms_admin_preview_ce_report`) that returns the same candidate set as `lms_admin_create_ce_report_run` — ideally factor the shared SELECT into one function both call — and delete the TypeScript re-implementation. Pass the previewed `completion_id[]` into run creation so the frozen set is exactly what was approved, and have the run fail loudly if the set changed. Emit non-exportable completions (no profile, no program ID, non-string CFP ID) into an explicit `excluded` bucket with reasons.

---

## A1-4 · Deleting a module permanently locks every module after it

**`src/engine/progression.ts:93-96`** + **`supabase/migrations/20260717003000_f1_server_remediation.sql:475-480`**

`moduleUnlocked` finds the previous module by `candidate.position === module.position - 1` — exact adjacency. `lms_admin_crud`'s `delete_module` deletes the row and **does not renumber**.

### Failure narrative

An operator deletes module 5 of the 14-module FPT. Positions become 1,2,3,4,6,7…14. Module 6 looks for position 5, finds nothing, `return false` → locked. Modules 7–14 are gated on module 6's quiz, which can never be passed. **Every learner in the flagship course is permanently blocked past module 4**, with no error anywhere — the engine returns a legitimate `false`.

This runs identically on the server (all six edge functions embed the same engine), so it is not a display bug. Recovery exists only by accident: `lms_admin_reorder` renumbers 1..N and would repair it, but nothing tells the operator to run it.

### Directed fix

Make `moduleUnlocked` order-based rather than adjacency-based: sort the course's modules by position and take the immediately preceding element. Independently, have `delete_module` (and `delete_lesson`) renumber siblings within the same transaction. Add engine tests for a non-contiguous position sequence (1,2,4) and for a deleted first module.

---

## A1-5 · The question bank round-trip silently destroys multi-answer keys

**`supabase/functions/lms-admin/index.ts:334-356`** and **`supabase/migrations/20260716224000_lms_admin.sql:202-247`**

Export emits `correct: (question.correct as string[])[0] ?? ''` and only `choice_a`..`choice_d`. Import validates `correct_id not in ('a','b','c','d')` and writes `jsonb_build_array(value ->> 'correct')` — a one-element array. `src/lib/adminCsv.ts:51` enforces the same on the client.

### Failure narrative

The grading engine, `exactSetMatch`, and F2's `select_kind:'multi'` rendering all fully support multi-answer questions — but the authoring surface cannot represent one. Export a bank containing a "select all that apply" question and re-import it (the D6 acceptance scenario) and every additional correct id is **silently dropped**: the question becomes single-answer, learners who would have failed now pass, and prior attempt records no longer match current grading. Choices beyond four, or with non-`a/b/c/d` ids, are emptied to `''` the same way.

This is also a content-load blocker: the real 14×10 FPT bank cannot contain a multi-answer or 3-/5-option question.

### Directed fix

Change the interchange shape to carry `choices: [{id,text}]` and `correct: [ids]` verbatim, with round-trip tests asserting byte-equality for a multi-answer, 5-choice question. If single-answer/4-choice is a deliberate content constraint, enforce it at *write* time with a CHECK on `lms_quiz_questions` and reject the import loudly — do not silently truncate.

---

## A1-6 · Learner-writable profile columns are unvalidated and flow verbatim into the CFP Board filing

**`supabase/migrations/20260725060000_x1_profile_review_mode.sql:1-10,33-44`** + **`20260727160000_r1_ce_reporting.sql:7-19`**

`authenticated` holds a direct UPDATE grant on `display_name, first_name, middle_name, last_name, firm, job_title, phone, firm_url, address, credential_ids, updated_at`. The only constraints in existence are `jsonb_typeof(address)='object'` and `jsonb_typeof(credential_ids)='object'`. No length bound, no format check, no value-type check, on any column. `src/pages/AccountPage.tsx:112-154` sets no `maxLength`, and PostgREST bypasses the form anyway.

### Failure narrative

1. `first_name`/`last_name`/`credential_ids.cfp` are copied unmodified into `lms_ce_report_runs.rows` and then into the .xlsx handed to CFP Board — with no length cap, no charset restriction, and no numeric validation on the Board ID. Both name columns are `not null default ''`, and `lms_admin_create_ce_report_run` gates only on the CFP ID being non-empty, so **a filing row with blank attendee names is exportable**.
2. `address` and `credential_ids` accept arbitrarily large jsonb from any authenticated user — a storage and cost vector against the shared production database.
3. `updated_at` being learner-writable makes it worthless as an audit field.
4. `firm_url` accepts any string with no scheme check; it is currently only rendered as text at `src/pages/AdminPages.tsx:995`, so there is no live XSS — but nothing prevents a future render as an `href`.

### Directed fix

Add CHECK constraints in one migration: length caps on all text columns (e.g. 200); `pg_column_size(address) < 4096` and `pg_column_size(credential_ids) < 1024`; `credential_ids` values must all be `jsonb_typeof = 'string'` and ≤64 chars; `firm_url` must match `^https?://`. Revoke `update(updated_at)` — the `lms_learner_profiles_set_updated_at` trigger already stamps it. Add a CHECK or an export-time guard rejecting blank `first_name`/`last_name` on any row entering a CE run.

---

## A1-7 · Admin reads of member PII are unaudited — including the answer-key export

**`supabase/functions/lms-admin/index.ts:941-956`**

`survey_results` (line 469) and `export_survey_responses` (line 618) write audit rows. Four sibling actions do not:

- **`inspect_learner`** — full profile, address, phone, credential IDs, every attempt and response
- **`preview_ce_report`** — every certified learner's name, email and CFP Board ID
- **`list_ce_report_runs`** — `select('*')`, the frozen PII of every past filing
- **`export_question_bank`** — **the quiz answer keys**, the single most sensitive read in the system, with no record that it happened

### Failure narrative

V1-SPEC §4 states admin reads of member data go through lms-admin "operator-gated, **audited**". R1 makes `lms_ce_report_runs` the 3-year retention record for a regulatory obligation. An operator (or anyone holding an operator token) can enumerate every learner's PII and exfiltrate every answer key, and `lms_admin_actions` shows nothing. There is no way to answer "who pulled the answer keys" after an incident.

### Directed fix

Call `audit()` in all four paths with a target recording scope and row count (`inspect_learner`: the email; `preview_ce_report`: course_ids/period/counts; `list_ce_report_runs`: run count; `export_question_bank`: module_id/quiz_id). Consider elevating `export_question_bank` to its own action name so it is trivially greppable in the ledger.

---

## A1-8 · Editing a survey flow orphans every prior response's recorded path

**`supabase/migrations/20260727080000_v1b_survey_branching.sql:498`**

`lms_admin_replace_survey_flow` executes `delete from public.lms_survey_sections where lesson_id = p_lesson_id` and recreates sections with new UUIDs. `lms_survey_responses.path` is a `uuid[]` with **no referential integrity** to sections, and existing rows are immutable and never revisited.

### Failure narrative

V1b §1 makes the recorded path "authoritative … so read-back and reporting know exactly what was shown." One admin flow edit invalidates that permanently.

`surveyResults` computes `eligible = responseRows.filter(r => r.path.includes(question.section_id))` (`lms-admin/index.ts:488`) — every historical response now has a denominator of 0, so **all prior survey data silently reads as zero responses per question** while `response_count` still shows the true total. The CSV export degrades path labels to raw UUIDs and blanks every answer column (line 602 requires `path.includes(question.section_id)`). The learner's own submitted view renders nothing: `src/components/SurveyLesson.tsx:97` `if (!section) return null`. No error is raised anywhere.

### Directed fix

Preserve section identity on edit — match incoming sections by supplied `id` and `update` rather than delete-and-recreate, deleting only genuinely removed sections. Refuse to delete any section still referenced by a response `path` unless the operator explicitly confirms. Longer term, version survey flows so responses bind to the flow revision they were shown.

---

# MEDIUM

## A1-9 · `lms-submit-survey` is missing from `config.toml` — Hard Rule 8

**`supabase/config.toml`** — six functions declared; `lms-submit-survey` is the seventh on disk and has no block. Hard Rule 8 is "verify_jwt=true on **every** edge function in this repo."

Practical exposure today is nil (the CLI default is `true`, and `callerId` rejects a missing bearer token with 403), but the deployment posture of one function is unmanaged and a `--no-verify-jwt` deploy would leave only the in-function check.

**Fix:** add `[functions.lms-submit-survey]` / `verify_jwt = true`. Add a CI assertion that every directory under `supabase/functions/` has a matching block.

## A1-10 · Survey text answers are unbounded on the sanctioned path too

**`supabase/functions/lms-submit-survey/routing.ts:105-111,156-162`** — `normalizeAnswer` for `kind:'text'` and the `choiceFreeText` loop accept any string, `.trim()` only. No `maxLength` on `SurveyLesson.tsx:200` or `:283` either. Independent of A1-2, any learner can POST a multi-megabyte free-text answer through the front door.

**Fix:** cap at ~4000 chars for `text` and ~500 for option free-text, reject over-length with `SurveyFlowError`, and add matching `maxLength` on the inputs plus a CHECK on `pg_column_size(answers)`.

## A1-11 · `Access-Control-Allow-Origin: '*'` on all seven functions

`lms-admin/index.ts:5`, `lms-grade-attempt:20`, `lms-get-quiz:12`, `lms-progress:13`, `lms-playback-token:14`, `lms-resource-token:13`, `lms-submit-survey:18`.

Known as L-2 and deferred to the promotion spec — **this is the promotion spec's audit, so it is now in scope.** Not CSRF-exploitable (bearer header, not cookies), but in a production project shared with the command center it means any origin can invoke the admin surface with a captured token.

**Fix:** pin to an allowlist from an env var (`LMS_ALLOWED_ORIGINS`), echoing only on match.

## A1-12 · Server-derived `review_mode` is computed on every heartbeat and thrown away

**`supabase/functions/lms-progress/index.ts:182-193,272`** vs **`src/pages/LessonPage.tsx:198`**

`requireLessonAccess` runs a full `courseComplete` to derive `review_mode` on every 15-second heartbeat and returns it — and no client code reads it. `LessonPage` derives its own `reviewMode={complete || courseComplete}` from client-held snapshot data, and `lms-playback-token`, the function that actually authorizes playback, does not return `review_mode` at all.

**This is not a security hole** — `lms_record_video_heartbeat` re-derives the same `completed_at is not null` condition server-side (`x1:186-208`) and freezes `max_watched_seconds` for completed lessons, so tampering buys only local 2× playback and unclamped scrubbing. It is dead work on the hot path and a design that reads as server-trusted without being wired.

**Fix:** return `review_mode` from `lms-playback-token` and consume it in `LessonPlayer`, or delete the derivation from `lms-progress`.

## A1-13 · `manual_admin` completions are filed to CFP Board indistinguishably from earned ones

**`supabase/migrations/20260716224000_lms_admin.sql:325-335`** + **`20260727160000_r1_ce_reporting.sql:490-503`** — `lms_admin_support_action` inserts a completion event with no requirement verification (correct per §7), but `lms_admin_create_ce_report_run` does not filter on or record `trigger`, and the frozen `rows` jsonb omits it. DACFP certifies CE credit to the Board for a manually-marked completion with nothing in the filing record distinguishing it.

**Fix:** add `'trigger', completion.trigger` to the frozen row object, surface it in the preview table, and require an explicit operator opt-in to include `manual_admin` completions in a run.

## A1-14 · A legitimate empty result surfaces as a 500

**`supabase/migrations/20260727160000_r1_ce_reporting.sql:531-533`** raises `'no reportable completions'` with errcode `22023`; `lms-admin` has no `22023` mapping (contrast `lms-progress:261` and `:282`), so `assertQuery` throws a plain `Error` and the operator gets "Admin request could not be completed."

**Fix:** map `error.code === '22023'` to `InvalidRequest` in the `lms-admin` catch, returning 400 with the underlying message.

## A1-15 · The F2 mutation-lifecycle pattern was not adopted by the V1-era admin reads

**`src/context/AdminContext.tsx:149-163`** — `surveyResults` and `exportSurveyResponses` call `provider.adminRequest` then `await loadAdminSnapshot()` directly, outside `runMutationLifecycle`. A refresh failure therefore rejects the whole call and the caller reports the *read* as failed — precisely the conflation F2 2b was created to eliminate, reintroduced two sessions later. `mutate` and `createCeReportRun` do it correctly.

**Fix:** route both through `runMutationLifecycle` with `refresh: () => loadAdminSnapshot()`.

## A1-16 · The client fetches whole tables and filters in JavaScript

**`src/data/supabaseProvider.ts:243-249,282-314`** — `tableRows()` issues `select('*')` with no predicate for `lms_learner_profiles`, `lms_enrollments`, `lms_lesson_progress`, `lms_quiz_attempts`, `lms_survey_responses`, `lms_completion_events`; ownership is then applied client-side (`profiles.find(item => item.auth_user_id === user.id)`, line 297).

Correct today because RLS is sound, but it means **any future policy loosening immediately ships every learner's PII to every browser** with no second gate. `getModuleView`/`getLessonView` (lines 316-351) additionally call `getCatalog()` — seven full table reads — on every module and lesson navigation.

**Fix:** add explicit `.eq('auth_user_id', user.id)` / `.in('enrollment_id', …)` filters, and scope catalog reads to the course in view.

## A1-17 · Editing `duration_seconds` retroactively un-completes learners

**`src/engine/progression.ts:61-63`** — `lessonComplete` for video derives from `max_watched_seconds >= duration_seconds * 0.95`, while the database stores `completed_at`. An operator correcting a video's duration upward makes previously-complete lessons fail the engine test everywhere (dashboard, module page, `courseComplete` in all six functions) even though `completed_at` is set and a completion event already exists. The learner's course silently reverts to incomplete against an append-only completion record.

**Fix:** make `lessonComplete` authoritative on `completed_at` for all lesson kinds — the 95% rule already lives in `lms_record_video_heartbeat` where the write happens.

## A1-18 · `replace_survey_flow` validates less than `replace_survey_questions`

**`supabase/migrations/20260727080000_v1b_survey_branching.sql:481-494`** — the flow editor checks position, prompt and kind, but not choices. `replace_survey_questions` (`:620-631`) requires `jsonb_typeof(choices)='array'` with `>= 2` elements. The row trigger's choice loop iterates `jsonb_array_elements(new.choices)`, which yields zero rows for null — so **a required `single_choice` question with no choices can be created through the flow editor**, which the learner can never answer, permanently blocking a required survey and therefore course completion. `perform (section ->> 'id')::uuid` at `:476` also lets a missing id through to a NOT NULL violation → 500 instead of 400.

**Fix:** lift the `replace_survey_questions` choice validation into `replace_survey_flow`, and into the `lms_validate_survey_question_lesson` trigger so both entry points are covered.

## A1-19 · `anon` holds a SELECT grant on `lms_learner_profiles`

**`20260716195228_lms_auth_foundation.sql:18`** grants select to `anon`; **`20260716203655_lms_schema.sql:153`** revokes it again. Net state is correct, and no `anon` policy exists so RLS returns zero rows regardless — but the grant/revoke split across two migrations is fragile, and in a shared production project any future `for select to public` policy would immediately expose names, phone, address and credential IDs to unauthenticated callers.

**Fix:** consolidate to a single explicit `revoke all … from anon` and add a CI/advisor assertion that `anon` holds no grant on any `lms_*` table.

## A1-20 · Logout does not revoke the refresh token

**`src/data/supabaseProvider.ts:577`** — `signOut({ scope: 'local' })` clears local storage only; the refresh token stays valid server-side until natural expiry. For operator accounts in a shared production project, a token captured before logout keeps working.

**Fix:** use the default global scope, or `scope: 'global'` explicitly, unless multi-tab behaviour is a deliberate requirement — in which case document it.

## A1-21 · The learner CE panel promises reporting for courses that cannot be reported

**`src/pages/AccountPage.tsx:162-168`** — the message ladder branches only on `credentialIds.cfp` and `reporting?.reported_at`, ignoring `course.cfp_program_id`. A learner completing the Renewal course (program ID explicitly PENDING per R1-SPEC §0) is told "Reporting scheduled — DACFP reports within 14 days of certification" for a filing that cannot occur. The check also reads live form state, not saved state, so typing an ID flips the message before saving.

**Fix:** branch on `course.cfp_program_id` first with a distinct "CE reporting for this course is not yet available" state, and read `profile.credential_ids` rather than the form.

## A1-22 · `xlsx@0.18.5` carries two HIGH advisories with no fix available

`npm audit`: GHSA-4r6h-8v6p-xvw6 (prototype pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS), **"No fix available"** — the npm-published `xlsx` line ends at 0.18.5; SheetJS ships ≥0.19 only from its own CDN.

Live exploitability here is low: the only workbook parsed is the first-party template shipped in `dist/`. But this is the CE-reporting money path and any CI gate with `npm audit --audit-level=high` fails permanently.

**Fix:** pin to `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` per SheetJS's documented migration, or replace with a maintained writer (`exceljs`) — the code only needs read-template + write-cells.

---

# LOW

## A1-23 · Two CSV writers, one hardened

`csvCell` in `lms-admin/index.ts:498-502` prefixes `'` for `=+-@`; `escapeCsv` in `src/lib/adminCsv.ts:98-101` does not, so an operator-authored prompt beginning with `=` is a live formula in the exported question bank.

*(The .xlsx path is clean — `src/lib/cfpCeExport.ts:108` writes `t:'s'` string cells, never `f`.)*

**Fix:** extract one shared `csvCell` and use it in both.

## A1-24 · Download URL revoked synchronously after `click()`

`src/lib/cfpCeExport.ts:144-148` — the anchor is never appended to the DOM and `revokeObjectURL` fires immediately; both are known to abort the download in Firefox/Safari. On the CE money path the run is already frozen server-side, so the operator silently gets a recorded run and no file.

**Fix:** append the anchor, click, then revoke inside `setTimeout(…, 0)`.

## A1-25 · `npm run lint` is not a linter

`package.json:9` aliases lint to `tsc -b --pretty false`; there is no ESLint in the tree. The `eslint-disable-next-line react-hooks/exhaustive-deps` at `src/pages/CeReportingPage.tsx:108` suppresses nothing and marks a genuinely stale dependency array (`initiallySelected` is omitted) that no tool checks.

**Fix:** adopt ESLint with `react-hooks` (deferred as overhaul scope in SPEC-FIXES §4 — it is CI's prerequisite now), or delete the inert directive and rename the script `typecheck`.

## A1-26 · `inspectLearner` N+1

`lms-admin/index.ts:885-905` issues three queries per enrollment inside a `Promise.all` over enrollments — 8 enrollments (FPT + 6 bonus + renewal) is 24 round-trips for one inspector view. This is the "timeout-hungry admin test" smell the charter names.

**Fix:** fetch modules/lessons/quizzes once for all courses in scope and group in memory.

## A1-27 · `lms_ce_reporting_status()` scans every frozen run per learner

`20260727160000_r1_ce_reporting.sql:612-617` does `cross join lateral jsonb_array_elements(report_run.rows)` over all runs, on every learner snapshot load. Cost grows with total rows ever reported.

**Fix:** maintain a `lms_ce_reported_completions(completion_id, run_id)` projection written in the same transaction as the run, and index it.

## A1-28 · Main bundle 718 kB

`dist/assets/index-*.js` 718.57 kB raw / 204.73 kB gzip. Composition confirmed by marker analysis: `@supabase/supabase-js` + `react-router` + `radix-ui` (13 UI files importing from the `radix-ui` umbrella package) + `react-dom` + `lucide-react`. `xlsx`/SheetJS is correctly isolated in the 497 kB `AdminApp` chunk and `react-markdown` in a 121 kB lazy chunk — M-12 landed.

**Fix:** import Radix primitives from their individual `@radix-ui/react-*` packages rather than the umbrella; lazy-load `AuthPages` and `CertificatePage`.

---

# NOTE

## A1-29 · CE-bearing content is completable in ⅔ of its runtime, and `open` courses have no seat-time check at all

`20260725060000_x1_profile_review_mode.sql:201` — `v_allowed_growth = max(2, elapsed*1.5 + 1)`, and the plausibility branch is guarded by `v_progression = 'sequential'`. Two requests 20 minutes apart complete a 30-minute video. For `open` courses — which after R1 includes all six separately registered bonus CE programs — no plausibility check runs at all.

This is spec-conformant (SPEC §4 specifies ~1.5×, Hard Rule 11 forbids more), but R1 changed the stakes: completion is now a CFP Board filing. Flagging for a policy decision, not as a code defect.

## A1-30 · `public.` vs `lms_private.` inconsistency in the policy ledger

`20260716204707:12` moves `lms_has_course_access` to `lms_private`; D2 policies were written against `public.` and bind by OID, so they still work — but the ledger now reads inconsistently, and a future `create or replace function public.lms_has_course_access` would create a *second* function the D2 policies do not use.

*(Verified: the schema and function move are both tracked; migrations are re-runnable in order.)*

## A1-31 · `T07:00:00Z` is correct only because Arizona has no DST

`lms-admin/index.ts:702,709` hardcodes the offset while the SQL uses `at time zone 'America/Phoenix'`. They agree today. Undocumented coupling. Add a comment or use a named zone on both sides.

## A1-32 · `docs/cfp-ce-template.xlsx` is a production runtime input

`src/lib/cfpCeExport.ts:15` resolves it via `import.meta.url`; it is emitted to `dist/assets/`. Correct today — worth recording so a `docs/` cleanup does not break the export.

## A1-33 · Seed-shaped DML inside a migration

`20260727160000_r1_ce_reporting.sql:56-228` creates bonus courses, modules, lessons and **backfills enrollments** inside the migration ledger. On an empty-of-LMS production the `join … flagship.slug = 'fpt-sandbox'` matches nothing and it degrades to a no-op — see cohabitation §6.3 for the consequence.

## A1-34 · Clean scans

Zero `any`, zero `@ts-ignore`/`@ts-expect-error`, zero `dangerouslySetInnerHTML`, one `TODO`-class string (`ModulePage.tsx:192` "Instructor profile coming soon"), `target="_blank"` carries `rel="noreferrer"`. `Markdown.tsx` is correctly hardened — no `rehype-raw`, `rehype-sanitize` applied, dangerous tags filtered, `href` protocols restricted to http/https/mailto.

---

# PRODUCTION-BLOCKERS

Must close before promotion into the shared production project:

| # | Finding | Why it blocks |
|---|---------|---------------|
| 1 | **A1-1** auth.users role trigger | Damages the command center. The only finding that breaks a *different* production system. |
| 2 | **A1-2** survey direct-insert grant | Learner-writable bypass of all server validation on a path that feeds CE credit; one-line fix already proven by the F1 quiz rider. |
| 3 | **A1-3** CE preview/export divergence | The operator's approval does not bind what is filed with CFP Board. Regulatory-filing integrity. |
| 4 | **A1-6** unvalidated profile → filing | Unbounded learner-controlled text with blank-name rows enters a regulatory export; also an unbounded-write vector in a shared DB. |
| 5 | **A1-9** `verify_jwt` config gap | Hard Rule 8 is non-negotiable and the fix is three lines. |
| 6 | **A1-11** CORS `*` | Deferred as L-2 to "the promotion spec". This *is* the promotion spec. |
| 7 | **A1-35** CFP program-ID slug coupling | See cohabitation §6.3 — silently yields zero exportable rows in production. |
| 8 | **A1-36** seed must be provably excluded | See cohabitation §6.4 — no mechanism currently prevents it. |

**Should-fix before general availability (not promotion-blocking):** A1-4, A1-5, A1-7, A1-8, A1-13, A1-18, A1-22.

**Backlog:** everything else.

---

# CODE-QUALITY SUMMARY

## Overall

This is disciplined work. Thirteen sessions produced a codebase with no `any`, no suppression comments, no dead TODOs, a hardened Markdown renderer, a byte-identity test for the duplicated engine, consistent generic auth errors, correct RLS on every table with `force` applied, `search_path = ''` on every SECURITY DEFINER function, and complete `revoke`/`grant` pairs on every function. The build is clean, the suite is green, and Hard Rules 1, 4, 5 and 12 all verify. The findings above are real, but they are the exceptions in an otherwise tight tree — which is exactly why they need naming.

## Patterns that drifted across the sessions

1. **The write-grant lesson was learned twice and forgotten once.** F1 revoked learner INSERT/UPDATE on `lms_quiz_attempts` (the rider) and D3 did the same for `lms_lesson_progress` (`20260716210721:26-30`). V1 then granted learner INSERT on `lms_survey_responses` and never revoked it (A1-2). The correct pattern — *learner writes go through service-role edge functions only* — exists in the repo twice and was not applied the third time.

2. **Server logic re-implemented in TypeScript instead of shared.** The progression engine has an enforced byte-identity discipline across six copies, with an executable test. R1 then implemented the CE selection *twice in two languages* with no test comparing them (A1-3). The repo has both the good pattern and its violation, three sessions apart.

3. **The F2 mutation helper stopped being the default.** `runMutationLifecycle` is used correctly by `AdminContext.mutate` and `createCeReportRun`, and skipped by the V1-era `surveyResults`/`exportSurveyResponses` which hand-roll the exact mutation+refresh coupling F2 was written to kill (A1-15).

4. **Auditing became optional as the admin surface grew.** D6's actions all audit atomically inside SQL functions. V1's survey reads audit. R1's `create_ce_report_run` audits. But `inspect_learner`, `preview_ce_report`, `list_ce_report_runs` and `export_question_bank` do not (A1-7) — coverage decayed as actions were added to the switch statement rather than being enforced structurally.

5. **Two entry points, two validation standards.** `replace_survey_questions` validates choices; `replace_survey_flow`, written later for the same data, does not (A1-18). Same shape as A1-3: the second implementation is thinner than the first.

6. **Structural coupling to contiguous positions.** V1 correctly generalised "first module" from `position === 1` to lowest-position — but left `position - 1` adjacency in the same function (A1-4). Half the generalisation landed.

## Test-suite honesty

198 tests across 24 files, all green in 22.9s, and the honest verdict is: **they are good tests of the wrong half of the system.**

What they genuinely prove is strong — `grading.test.ts` uses `it.each` to cover every malformed-input case SPEC-FIXES 1g demanded (non-array, foreign question id, foreign choice id, duplicate choices) plus exact-set boundaries and weighted scoring; `progression.test.ts` covers 15 progression scenarios; `engine-identity` and `routing-identity` make the copy discipline executable; `edgeQuizPayload.test.ts` is a real automated Hard Rule 4 proof; `a11y.test.tsx` has 15 assertions and `App.routes.test.tsx` 45.

But **no test in the repository exercises an authorization boundary.** `supabaseProvider.test.ts` is three pure row-mapping tests. There is no test of RLS, of operator gating, of an edge function's access-control path, or of the wire format under a real session. Every Critical and High in this report lives in exactly that untested region — A1-2 is a grant that no test asserts is absent, A1-1 is a trigger no test fires. The suite's greenness is therefore not evidence about the security posture, and the gate reports' manual SQL evidence is the *only* proof those paths have ever had.

`survey/routing.test.ts` (5 cases) is also thin for the most intricate new logic in the build, and `cfpCeExport.test.ts` (2 cases) thin for a regulatory export.

**Recommendation for the CI session:** an integration suite that runs against a disposable branch database asserting the negative cases — learner A cannot read learner B, `anon` reads nothing, a learner INSERT into each learner-facing table is denied, a non-operator `lms-admin` call is 403, and no response body contains `correct`.

## Dependency tree health

`npm audit`: **7 vulnerabilities (5 high, 2 moderate)** across 518 production dependency paths.

- **`xlsx` 0.18.5** — 2 HIGH, **no fix available** (A1-22). Real, low-exploitability, permanently red in CI.
- **`react-router` 7.12.0–8.2.0** — HIGH, RSC-mode CSRF bypass. `react-router-dom@^7.18.1` is in range; the app does not use RSC mode, and the only fix is a breaking downgrade to 7.11.0. Track, do not downgrade.
- **`shadcn@^4.13.0` is in `dependencies` and is never imported.** It is a scaffolding CLI. It drags `@modelcontextprotocol/sdk`, `@hono/node-server`, `@babel/core`, `@dotenvx/dotenvx`, `execa`, `open` and ~30 more into the *production* tree, and is the direct parent of 2 of the 7 advisories. **Removing it is the single highest-value dependency action available** — it eliminates two advisories and a large share of the 518 paths for zero functional change.
- Everything else (`react`, `@supabase/supabase-js`, `radix-ui`, `lucide-react`, `sonner`, `clsx`, `tailwind-merge`, `class-variance-authority`, `react-markdown`, `rehype-sanitize`) is current, warranted, and MIT/ISC.
- Lockfile is committed and consistent; `.env` is gitignored and untracked; `.DS_Store` is gitignored (present on disk, not tracked).

---

# §6 — PRODUCTION-COHABITATION CENSUS

Audited as if performing the merge into the production project shared with the command center.

## 6.1 Namespace collision census — clean

Every object the LMS creates is prefixed. Zero unprefixed objects exist in the migration set (verified by exhaustive grep).

| Class | Count | Names |
|---|---|---|
| Tables | 16 | all `public.lms_*` |
| Views | 1 | `public.v_lms_person_progress` |
| Functions | 23 | 22 × `public.lms_*`, 1 × `lms_private.lms_has_course_access` |
| Schemas | 1 | `lms_private` |
| Triggers | 8 | all `lms_*`; **2 on `auth.users`** — see 6.2 |
| Indexes | 17 | all `lms_*_idx` |
| Policies | 14 | all `lms_*` |
| Storage buckets | 2 | `lms-resources`, `lms-video` |
| Edge functions | 7 | all `lms-*` |
| Event triggers | 0 | ✓ (`ensure_rls` explicitly dropped at `f1:517`) |

**Verdict: no collision risk from naming.** The only cross-system contact surface is `auth.users` and the `raw_app_meta_data.role` claim.

## 6.2 Shared `auth.users` — the blocker

Three points of contact, in descending severity:

1. **Trigger interference (A1-1, Critical).** `lms_auth_user_stamp_learner_role` (BEFORE INSERT) unconditionally overwrites `raw_app_meta_data.role` for *every* insert; `lms_auth_user_create_learner_profile` (AFTER INSERT) creates an LMS profile row for *every* user. Neither is scoped. Alphabetical trigger ordering means the LMS stamp wins over most plausibly-named command-center triggers. **Must be fixed before promotion.**

2. **Metadata convention collision.** `lms_admin_actor_is_operator` (`lms_admin.sql:47-60`) grants full LMS operator authority based on the shared, unnamespaced `raw_app_meta_data->>'role' = 'operator'`. The command center's role model must be inspected (Leg A2) to confirm no overlap; regardless, the LMS claim should be namespaced to `lms_role`.

3. **Direct `auth.users` / `auth.identities` writes.** `lms_grant_enrollment` (`r1:288-345`) INSERTs into both tables by hand rather than via the Auth Admin API, with `raw_app_meta_data = '{}'` and no `provider`/`providers` keys — so LMS-provisioned users carry non-standard app metadata in the shared auth store. Known as N-2 and assigned to "the promotion spec"; this is that audit. Escalate to a fix item, not a blocker, since the trigger stamps a role over the `'{}'` regardless.

4. **Open self-signup.** `supabaseProvider.signUp` (`src/data/supabaseProvider.ts:533`) is wired to a public form. If Supabase signups remain enabled after promotion, anyone can create an account in the production auth project shared with the command center. The account sees nothing (no enrollment), but it exists alongside 5 admin accounts and gets a profile row. **Promotion must make an explicit decision**: disable public signup and provision only through `lms_grant_enrollment`, or accept and rate-limit it.

## 6.3 Migration re-runnability on an empty-of-LMS production — mostly good, one silent failure

**Verified good:** all 16 migrations are ordered, self-consistent, and re-runnable. `lms_private` is created before first use (`20260716204707:8`) — the survey policies' `lms_private.lms_has_course_access` reference resolves. `IF EXISTS`/`IF NOT EXISTS` discipline is applied where re-entrancy matters (`drop policy if exists` ×8, `drop constraint if exists`, `create schema if not exists`, `on conflict do update` on bucket and content inserts). Storage-bucket inserts are idempotent. No migration depends on seed data existing.

### A1-35 (BLOCKER) — CFP program IDs silently never attach in production

`20260727160000_r1_ce_reporting.sql:56-76` sets `cfp_program_id` by matching `lms_courses.slug` against a hardcoded list containing both sandbox and non-sandbox names (`'fpt-sandbox'`/`'financial-professional-track'`, `'custody-security-sandbox'`/`'custody-security'`, …).

On a production database whose real courses use *any other slug*, the UPDATE matches zero rows, every `cfp_program_id` stays null, and `lms_admin_create_ce_report_run` raises `'no reportable completions'` for every run — surfacing to the operator as a generic 500 (A1-14). **The entire CE reporting feature fails closed and near-silently.**

**Fix:** make production slugs an explicit, documented promotion input; add a post-migration assertion that every course intended to be reportable has a non-null `cfp_program_id`.

**Related (A1-33):** the same migration contains content-and-enrollment seeding (`:85-228`) that no-ops in production because it joins on `slug = 'fpt-sandbox'`. Harmless, but it means the migration ledger mixes schema and sandbox content — the promotion migration set should be reviewed to strip sandbox DML.

## 6.4 Seed separation — no mechanism exists (BLOCKER, A1-36)

`supabase/seed.sql` (1066 lines) opens with `begin; set local role service_role;` and contains **no guard of any kind** — no environment check, no abort clause, no production marker test. It inserts courses with fixed UUIDs (`10000000-0000-4000-8000-000000000001`), the `fpt-sandbox` slug, and 7 synthetic learners at `@example.test`.

Separately, `supabase/config.toml` contains **only** the six `[functions.*]` blocks — there is no `[db.seed]` section, so seed application is governed entirely by which CLI command an operator types.

The charter's requirement is "seed must NEVER run in prod" and nothing currently enforces it.

**Fix:** wrap `seed.sql` in a guard that aborts unless a sandbox marker is present — e.g.

```sql
do $$
begin
  if (select count(*) from auth.users where email not like '%@example.%') > 0 then
    raise exception 'seed refused: non-synthetic users present';
  end if;
end $$;
```

— plus an explicit `[db.seed] enabled = false` in `config.toml` and a documented promotion runbook step.

## 6.5 Hardcoded sandbox references — clean

`git grep` across the tracked tree: the sandbox ref appears in exactly four files, all sanctioned (`.env.example:1`, `SPEC.md`, and two gate reports). **Zero occurrences of the production ref (Hard Rule 1)** anywhere in the working tree — no `*.supabase.co` host literals of any kind.

`supabase/config.toml` notably contains **no `project_id` line**, which is what makes this possible; record that as a deliberate constraint so a future `supabase init` does not reintroduce it. `vercel.json` is a bare SPA rewrite with no environment coupling. Pre-redaction history is Leg A3's item.

## 6.6 Environment-variable inventory — what promotion must provide

| Variable | Consumer | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `supabaseProvider.ts:72` | Vercel build-time; **embedded in the client bundle** |
| `VITE_SUPABASE_ANON_KEY` | `supabaseProvider.ts:73` | Publishable key; embedded in bundle — correct, but confirm it is the publishable and never the service key |
| `SUPABASE_URL` | all 7 edge functions (`serviceClient()`) | Platform-injected |
| `SUPABASE_SERVICE_ROLE_KEY` | all 7 edge functions | Platform-injected; **every function runs fully service-role and self-enforces authz** — that design makes A1-1/A1-2 the whole perimeter |
| *(none)* | CORS origins | A1-11 requires a new `LMS_ALLOWED_ORIGINS` |

No other environment variables are read anywhere. `.env` is gitignored and untracked; `.env.example` carries no secrets.

## 6.7 Storage

Two private buckets, both `lms-` prefixed. `lms-resources` is created with `public=false`, a 5 MB size limit and a 6-entry MIME allowlist (`lms_admin.sql:17-41`), re-applied idempotently via `on conflict do update` — a safe posture to carry into a shared project.

One behaviour to note for promotion: **`lms-playback-token` and `lms-resource-token` write to storage on a read path** — `ensurePlaceholderAsset` (`lms-playback-token/index.ts:174-192`) uploads a base64 placeholder MP4, and `ensureSeedResource` (`lms-resource-token/index.ts:160-177`) uploads a seed text file, both self-healing on first request. Both are path-gated to a single hardcoded constant so they cannot be triggered for arbitrary objects, but they are sandbox seeding logic living inside production runtime functions. **Remove both when real assets land**, and confirm bucket policies with Leg A2.

---

# Bottom line

The build is structurally sound and the F-series held across nine subsequent sessions. It is not yet promotable: one Critical defect would damage the command center on contact, one High re-opens a hole this project already knew how to close, and the newest subsystem — the CFP Board CE filing — has a preview that does not bind its export. Eight items block promotion; six of the eight are small, well-localised fixes. The remaining risk concentration is exactly where the test suite has never looked.
