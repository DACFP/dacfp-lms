# M2 GATE REPORT — Quiz Analytics + Survey Response Browser

Branch: `codex/m2-analytics` · Date: 2026-08-01
Sandbox: `xfvaohvismisfdggfdfj` (the only Supabase project touched)
Edge function: `lms-admin` version 24, JWT verification enabled.
Gate head: recorded in the live gate presentation after this report is committed and pushed.
Merge happens only on Jack's explicit phrase `merge approved`.

## Amendment 1 — ratified current-definitions contract

The accepted decision is **contract narrowing**. `M2-SPEC.md` §0 now states
that §1 and §2 intentionally score and render stored responses against the
current question and survey definitions. A new read-only population,
`v_lms_m2_definition_mutation_population`, derives relevant definition changes
from `lms_admin_actions`. Quiz analytics, the survey-response list, and routed
survey detail show the exact indicator **“Definitions changed since this data
was collected.”** when a matching audited definition mutation postdates data
displayed on that surface.

Attempt-time and submission-time definition snapshots are **ROUTED OUT** to the
named future write-path session **definition snapshot rider**. The two prior P1
findings—historical quiz scoring against current answer keys and historical
survey rendering against current survey definitions—are therefore closed as
**resolved-by-ratified-contract**, with that rider routed.

Current sandbox museum data has zero matching postdated quiz-bank actions and
zero matching postdated survey-definition actions. The legitimate live state is
therefore the indicator-not-shown case, verified on both local operator routes.
Creating a positive wet case would require a forbidden fixture or definition
mutation, so the shown case is covered by isolated rendered-route tests for §1
and §2, including routed survey detail. The audit-time derivation also has
direct unit coverage for older, same-time, unrelated, invalid, and postdated
mutation rows.

## §5 Gate evidence

### 1. Population views: each named view's definition shown; at least two figures proven equal to their view's direct SQL aggregate.

- `v_lms_m2_course_enrollment_population`: one row per enrollment with latest
  completion context (`20260801130000_m2_analytics_populations.sql`, lines 5–34;
  cardinality rider lines 4–30).
- `v_lms_m2_quiz_attempt_population`: submitted attempts only, joined through
  the shared enrollment population (population migration lines 36–67;
  cardinality rider lines 32–60).
- `v_lms_m2_quiz_question_population`: current ten-question bank crossed with
  submitted attempts; missing current question keys are unknown/excluded, while
  explicit empty selections remain misses (population migration lines 69–123;
  answer-presence rider lines 4–56).
- `v_lms_m2_survey_response_population`: immutable response rows with shared
  membership/completion context and stored presented path (population migration
  lines 125–157).
- `v_lms_m2_definition_mutation_population`: audited bank/survey definition
  mutations only (Amendment migration lines 4–18).

Direct SQL and the live FPT operator surface both reported **17 attempts**, **6
unique learners**, and **82.35% pass rate** (14/17). Direct SQL reported **13**
survey responses and the live unfiltered first page displayed **10 of 13**.

### 2. Per-question analytics on a museum-visible bank: miss rates and choice distributions match direct SQL (cited); sort by miss rate shown; correct-answer flags visible in UI.

For FPT module 1, the direct query excluded rows whose stored attempt lacks the
current question key, exactly matching the UI's two answered attempts per
question. Worst-first results were Q4/Q8/Q9 at **100% missed**, Q1 at **50%**,
then Q2/Q3/Q5/Q6/Q7/Q10 at **0%**. Choice parity examples: Q4 choice `b` was
selected 2/2; Q1 choices `a` and `b` were selected 1/2 each. The live surface
showed the same order/distributions and marked the correct choice. Tests assert
that no quiz export control exists; correct-answer flags never enter an export.
If a bank change postdates any displayed attempt, stored historical pass flags
are not mixed with current per-question scoring: pass rate and attempts-to-pass
render as **Unavailable** until the future snapshot rider can supply comparable
attempt-time definitions.

### 3. Insufficient-data state shown below the named minimum attempt count.

The named minimum is **2 submitted attempts**. The rendered quiz route test
uses a one-attempt module and verifies explicit “Insufficient data” copy while
derived rates/distributions are withheld. The full route suite includes this
case and passed.

### 4. Survey browser: filtered, paginated list matching direct SQL; an individual routed response rendered in presented order and matching its stored response row (cited).

Filter `course=FPT`, the selected museum survey, and submitted date 2026-07-28
returned **4 rows** in direct SQL and **4 rows** in the server-paginated browser.
The four response-row hashes, in displayed order, begin `bfd76e22`, `e00f9ee0`,
`6222eeb2`, `df046af2`. The first real routed response rendered four stored
sections in `path` order; its response/path/answers hashes begin
`bfd76e22` / `5e91b82f` / `e7887034`, matching the stored population row. No
edit, annotation, or status affordance exists.

### 5. CSV export of a filtered survey set: file contents match the on-screen set; the audited read row cited; §1 exports shown to exclude correct-answer flags.

The filtered CSV contained the same **4 response rows** in the same order as the
screen/direct query. Export status is derived across the entire filtered set,
not only the visible page; the response returns that status and the CSV's
`definitions_notice` column carries the exact Amendment indicator when needed.
The latest `export_m2_survey_responses` audit row has hash
prefix `63894336`, `row_count=4`, the same course/survey/date filters, and names
`v_lms_m2_survey_response_population`. The survey CSV contains response fields
only. §1 exposes no export path, and route coverage asserts no quiz export
button, so correct-answer flags remain UI-only.

### 6. Read-only proof: zero new mutation RPCs in the diff; zero new authenticated/anon grants; any new views/functions service-role scoped with pinned search_path (SQL cite).

M2 adds no mutation RPC or client mutation path. The only M2 write is the
required `lms_admin_actions` insert for survey exports. All five named views use
`security_invoker=on`; PUBLIC, anon, and authenticated have zero privileges;
service role has SELECT only. The Amendment view explicitly revokes all four
roles before granting service-role SELECT only (Amendment migration lines
20–27). No new SQL function is introduced, so no new function search path is
applicable.

### 7. Fixture integrity: all seven actors plus operators byte-identical on profile and enrollment state pre/post session (SQL cite); scratch learners fully cleaned up.

The original M2 pre/post profile-and-enrollment digests for fresh, almostdone,
failedquiz, fptcomplete, near-expiry, midmodule, d6operator, and Jack were
byte-identical. Amendment 1 applied only DDL, deployed the operator edge read
path, and performed read-only verification; it created no actor data action.
Final `m2-scratch-%` enrollment residue is **0 rows**. No museum actor was
mutated, re-staged, annotated, or used for positive mutation proof.

### 8. Suite green; lint, build, forbidden-ref scan clean; branch and commit hash.

- Affected Amendment suites: **3 files / 13 tests**, all passing.
- Full suite: **38 files / 290 tests**, all passing.
- `npm run lint`: clean.
- `npm run build`: clean.
- `git diff --check`: clean.
- Forbidden-reference scan: **0 matches**.
- Local operator browser: quiz and survey pages loaded; unchanged indicator
  count **0** on both, matching direct SQL; browser console warnings/errors **0**.
- Sandbox deployment: `lms-admin` v24 active with JWT verification enabled.
- Branch: `codex/m2-analytics`; final pushed commit hash is recorded in the live
  gate presentation because this report is part of that commit.

## Pre-gate fresh-context review

The mandated reviewer received only `M2-SPEC.md` and `git diff --cached main`.
Its findings are disclosed verbatim below, followed by dispositions.

### First review pass — findings verbatim

Findings, ordered by severity:

1. **[P1] Quiz rollups violate Amendment 1’s current-definitions scoring contract.** [supabase/functions/lms-admin/index.ts:651](/Users/jackmarshall/Desktop/DACFP%20LMS/supabase/functions/lms-admin/index.ts:651) and [supabase/functions/lms-admin/index.ts:664](/Users/jackmarshall/Desktop/DACFP%20LMS/supabase/functions/lms-admin/index.ts:664) derive pass rate and attempts-to-pass from stored `attempt.passed`. After a bank mutation, per-question results are scored against current answers while rollups retain historical outcomes. Rollups must be recomputed from current definitions or rendered unavailable.

2. **[P1] Filtered survey exports can use changed definitions without the required indicator.** The list status is calculated only from the paginated rows and shown at [src/pages/AdminM2Pages.tsx:462](/Users/jackmarshall/Desktop/DACFP%20LMS/src/pages/AdminM2Pages.tsx:462). The export processes the entire filtered population at [supabase/functions/lms-admin/index.ts:1067](/Users/jackmarshall/Desktop/DACFP%20LMS/supabase/functions/lms-admin/index.ts:1067), renders current question definitions, but neither computes nor returns an export-wide definition status. Older responses outside the visible page can therefore be exported under changed definitions with no disclosure.

3. **[P2] Amendment 1 derivation and shown/not-shown behavior lack end-to-end coverage.** [src/pages/AdminM2Pages.test.tsx:144](/Users/jackmarshall/Desktop/DACFP%20LMS/src/pages/AdminM2Pages.test.tsx:144) and [src/pages/AdminM2Pages.test.tsx:192](/Users/jackmarshall/Desktop/DACFP%20LMS/src/pages/AdminM2Pages.test.tsx:192) inject mocked statuses; they do not prove that pre/postdated audit actions produce the correct result. Detail has changed-only coverage, and the export path has no indicator coverage.

Verification boundary: reviewed only `/Users/jackmarshall/Desktop/DACFP LMS/M2-SPEC.md` and the exact staged output of `git diff --cached main`. I did not inspect other files, unstaged changes, history, runtime data, external state, or run tests.

### First review pass — dispositions

1. **Resolved.** When a matching bank mutation postdates displayed attempts,
   the server nulls derived pass rate and attempts-to-pass, and the UI labels
   both metrics **Unavailable** with explicit explanatory copy. Raw population
   counts remain visible and current-definition question analytics continue.
2. **Resolved.** Survey list status now scans minimal definition/timestamp rows
   across the entire filtered population. Export independently derives the same
   full-set status, returns it, records it in the export audit target, and emits
   the exact indicator through the CSV `definitions_notice` column.
3. **Resolved.** The shared edge derivation is now a pure tested module covering
   non-shown and shown timing cases. Rendered coverage includes quiz/list shown
   and not-shown states, detail shown and not-shown states, changed-rollup
   unavailability, and export-wide indicator propagation.

### Final review pass — findings verbatim

No findings.

Verification boundary: reviewed only `/Users/jackmarshall/Desktop/DACFP LMS/M2-SPEC.md` and the current staged output of `git diff --cached main`. I did not inspect other files, unstaged changes, history, runtime data, external state, or run tests.

## Disposition

The two earlier P1 findings are **resolved-by-ratified-contract** under
Amendment 1, with the definition snapshot rider routed. Fresh-review findings,
if any, are dispositioned immediately above the live gate; no merge is
performed at this gate.
