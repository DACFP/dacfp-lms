# DACFP LMS defect ledger

Inventory date: 2026-07-17  
Default test state: source-inspected only; browser/Supabase verification still required  
Allowed statuses: `OPEN`, `FIXED-PENDING-FULL-VERIFICATION`, `RESOLVED-SANDBOX-STATE`

No entry below authorizes production, sensitive-data, or destructive testing. Reproduction must use synthetic identities and the sandbox/local environment only.

## Summary

| ID | Severity | Finding | Status | Shared-cause / dependency tags |
| --- | --- | --- | --- | --- |
| QA-DEF-001 | High | Renewal completed/expired state misrepresented | FIXED-PENDING-FULL-VERIFICATION | `dashboard-state`, `renewal-contract`, `QA-DEF-010` |
| QA-DEF-002 | Medium | Secure resource exposed fake internal-link semantics | FIXED-PENDING-FULL-VERIFICATION | `semantic-control`, `resource-token`, `routing` |
| QA-DEF-003 | High | Admin course CRUD and lesson drag-reorder incomplete | FIXED-PENDING-FULL-VERIFICATION | `admin-authoring`, `SPEC-7`, `edge-capability-ui-gap` |
| QA-DEF-004 | High | Admin session-expiry handling skipped inspect/export reads | FIXED-PENDING-FULL-VERIFICATION | `admin-denial`, `reauth`, `shared-read-wrapper` |
| QA-DEF-005 | Medium | Learner inspector hides detailed progress/completion evidence | FIXED-PENDING-FULL-VERIFICATION | `admin-inspector`, `presentation-mapping`, `SPEC-7` |
| QA-DEF-006 | High | Multiple destructive quiz-reset controls are indistinguishable | FIXED-PENDING-FULL-VERIFICATION | `admin-support`, `destructive-action`, `target-labeling` |
| QA-DEF-007 | Medium | Unknown admin subroute rendered blank shell | FIXED-PENDING-FULL-VERIFICATION | `routing`, `admin-shell`, `recovery-path` |
| QA-DEF-008 | Medium | Auth pages lacked route-focus target | FIXED-PENDING-FULL-VERIFICATION | `accessibility`, `route-focus`, `auth-shell` |
| QA-DEF-009 | Low | Player seek message violated shared mm:ss formatting | FIXED-PENDING-FULL-VERIFICATION | `player-copy`, `time-format`, `SPEC-OVERHAUL-2` |
| QA-DEF-010 | High | Renewal `opens_at` contract was declared but ignored | FIXED-PENDING-FULL-VERIFICATION | `renewal-window`, `dead-api-surface`, `QA-DEF-001` |
| QA-DEF-011 | Medium | Admin empty and pending states are incomplete | OPEN | `admin-state-model`, `double-submit`, `empty-state` |
| QA-DEF-012 | Medium | Existing lesson resources are invisible in admin editor | FIXED-PENDING-FULL-VERIFICATION | `admin-resources`, `catalog-presentation`, `authoring-verification` |
| QA-DEF-013 | Low | Authenticated users can manually revisit login | OPEN | `auth-route`, `session-redirect`, `product-decision` |
| QA-DEF-014 | Medium | Main application bundle exceeds the configured performance warning threshold | OPEN | `performance`, `bundle-size`, `RA-14` |
| QA-INC-001 | High | Walkthrough credential drift blocked sandbox login | OPEN | `sandbox-fixture`, `credential-drift`, `walkthrough` |

## QA-DEF-001 — Renewal completed/expired state misrepresented

- Severity: **High**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: synthetic learner has a renewal enrollment in completed, expired, or revoked state.
- Reproduction before fix:
  1. Sign in as that learner and open `/dashboard`.
  2. Observe the Renewal event.
  3. A completed renewal offered `Start renewal`; expired/revoked access collapsed to `Not available right now` without a precise status.
- Expected: completed is `Review renewal`/complete; in-progress is Continue; expired/revoked is explicitly named and preserves the access/designation distinction.
- Evidence: former call passed only `actionable` and `resumePath` at `src/pages/DashboardPage.tsx:445-459`; former state-blind rendering was `src/components/RenewalEvent.tsx:42-84`.
- Current source change: dashboard now passes `complete`, `progress`, and `accessState`; RenewalEvent derives action/description/unavailable labels. `src/pages/DashboardPage.tsx:445-462`; `src/components/RenewalEvent.tsx:26-124`.
- Verification still required: incomplete, progressed, completed, expired, revoked, not-open, and closed-window browser states.
- Tags: `dashboard-state`, `renewal-contract`, `QA-DEF-010`.

## QA-DEF-002 — Secure resource exposed fake internal-link semantics

- Severity: **Medium**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: learner can see a lesson resource.
- Reproduction before fix:
  1. Open a module/lesson resource.
  2. Middle-click, use Open link in new tab, copy its address, or disable JavaScript.
  3. The anchor targeted `/resources/:id`, a route not defined in `App.tsx`; wildcard routing sent the user to dashboard instead of downloading or explaining failure.
- Expected: a client-triggered token download is exposed as a button, or a real routed URL implements equivalent secure behavior.
- Evidence: former anchor behavior `src/components/SecureResourceLink.tsx:37-50`; route list `src/App.tsx:31-59`.
- Current source change: control is a disabled-while-loading `button` invoking the token download. `src/components/SecureResourceLink.tsx:37-52`.
- Verification still required: keyboard activation, repeat click suppression, successful download, token error, and absence of modified-link semantics.
- Tags: `semantic-control`, `resource-token`, `routing`.

## QA-DEF-003 — Admin course CRUD and lesson drag-reorder incomplete

- Severity: **High**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: operator session with at least one synthetic course and multi-lesson module.
- Reproduction before fix:
  1. Open `/admin` and edit a course.
  2. Search the catalog/editor for Delete course; none exists.
  3. Try drag-reordering lessons; only module drag plus lesson up/down buttons exist.
- Expected: SPEC.md §7's course/module/lesson CRUD and drag-reorder acceptance is either fully reachable or the contract is explicitly amended. Destructive course deletion requires confirmation.
- Current source change: the course editor exposes a destructive `Delete course` confirmation wired to `delete_course`, and each lesson has a pointer drag grip while retaining up/down touch and keyboard controls. `src/pages/AdminPages.tsx:460-492,516-534`.
- Verification still required: cancel/confirm and failure behavior with a synthetic course; exact persisted lesson order after pointer drag and keyboard/touch fallback; audit-row and dependent-row consequences.
- Tags: `admin-authoring`, `SPEC-7`, `edge-capability-ui-gap`.

## QA-DEF-004 — Admin session-expiry handling skipped inspect/export reads

- Severity: **High**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: operator loads admin successfully, then session becomes denied/expired.
- Reproduction before fix:
  1. Expire the session.
  2. Search for a learner or export a question bank.
  3. Observe a generic local error rather than the required Sign in again dialog.
- Expected: every denied admin read/write raises the same non-dismissible re-auth path.
- Evidence: former direct forwarding at `src/context/AdminContext.tsx:115-123`; local generic catches at `src/pages/AdminPages.tsx:237-251,569-588`.
- Current source change: `inspectLearner` and `exportQuestionBank` callbacks classify `isLmsAccessDenied` and set session-expired. `src/context/AdminContext.tsx:115-145`.
- Verification still required: denied list, audit, inspect, export, mutation, and refresh actions all open one re-auth dialog; non-denied failures remain recoverable errors.
- Tags: `admin-denial`, `reauth`, `shared-read-wrapper`.

## QA-DEF-005 — Learner inspector hides detailed progress/completion evidence

- Severity: **Medium**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: inspected learner has multiple progress rows, attempts, and completion events.
- Reproduction:
  1. Open `/admin/learners`, inspect the synthetic learner.
  2. Compare the returned inspection shape to the screen.
  3. Progress is reduced to a count; completion is reduced to a single summary fact rather than detailed rows/history.
- Expected: per SPEC.md §7, enrollments, progress, attempts, completions, and profile evidence are inspectable with relevant identifiers/timestamps/status.
- Current source change: each enrollment now renders detailed lesson progress with completion/resume/furthest-watched/update facts and detailed completion-event facts without raw JSON. `src/pages/AdminPages.tsx:620-657`.
- Verification still required: empty/nonempty progress and completion rows, multiple enrollments, timestamp accuracy, and phone usability with long lesson identifiers.
- Tags: `admin-inspector`, `presentation-mapping`, `SPEC-7`.

## QA-DEF-006 — Multiple destructive quiz-reset controls are indistinguishable

- Severity: **High**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: inspected enrollment belongs to a course with two or more quizzes.
- Reproduction:
  1. Open that enrollment in `/admin/learners`.
  2. Inspect the support actions.
  3. Every trigger reads `Reset quiz attempt history`; dialog copy also omits the quiz/module identity.
- Expected: each destructive trigger and confirmation uniquely names module/quiz and selected learner/enrollment before deletion.
- Current source change: every reset trigger and dialog title includes the owning module position while preserving the existing learner/enrollment/quiz payload. `src/pages/AdminPages.tsx:664-673`.
- Verification still required: two-or-more-quiz learner inspection, accessible-name uniqueness, correct payload per confirmed dialog, cancel behavior, and audit evidence.
- Tags: `admin-support`, `destructive-action`, `target-labeling`.

## QA-DEF-007 — Unknown admin subroute rendered blank shell

- Severity: **Medium**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: operator session.
- Reproduction before fix:
  1. Navigate to `/admin/not-a-route`.
  2. Outer `/admin/*` role guard and provider loaded.
  3. Nested routes matched nothing, leaving an empty console content region.
- Expected: safe redirect or explicit admin not-found state.
- Evidence: outer wildcard `src/App.tsx:34-43`; former nested routes `src/pages/AdminApp.tsx:25-33`.
- Current source change: nested `*` redirects to `/admin`. `src/pages/AdminApp.tsx:25-34`.
- Verification still required: direct load and client navigation preserve operator shell/focus and terminate at `/admin` without a loop.
- Tags: `routing`, `admin-shell`, `recovery-path`.

## QA-DEF-008 — Auth pages lacked route-focus target

- Severity: **Medium**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: keyboard or screen-reader navigation between `/login` and `/reset`.
- Reproduction before fix:
  1. Activate Forgot your password or Back to sign in.
  2. `RouteFocus` searches for `#main-content` after pathname change.
  3. AuthShell's main had no matching id, so focus remained on stale navigation context.
- Expected: route change moves focus to the destination main without stealing focus on initial load.
- Evidence: focus helper `src/components/RouteFocus.tsx:16-33`; former AuthShell main `src/pages/AuthPages.tsx:29-68`.
- Current source change: AuthShell main now has `id="main-content"` and `tabIndex={-1}`. `src/pages/AuthPages.tsx:18-69`.
- Verification still required: login<->reset and recovery navigation by keyboard/screen reader, including initial-load behavior.
- Tags: `accessibility`, `route-focus`, `auth-shell`.

## QA-DEF-009 — Player seek message violated shared mm:ss formatting

- Severity: **Low**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: sequential video with saved max watched; attempt a forward seek beyond it.
- Reproduction before fix:
  1. Seek beyond furthest watched.
  2. Clamp succeeds.
  3. Status message reports raw seconds such as `123s`, while the rest of player uses mm:ss.
- Expected: every player time uses the shared formatter.
- Evidence: former message `src/components/LessonPlayer.tsx:242-255`; contract `SPEC-OVERHAUL.md:87`.
- Current source change: clamp status uses `formatClock`. `src/components/LessonPlayer.tsx:242-255`.
- Verification still required: values below/above one minute, fractional seconds, and screen-reader announcement.
- Tags: `player-copy`, `time-format`, `SPEC-OVERHAUL-2`.

## QA-DEF-010 — Renewal `opens_at` contract was declared but ignored

- Severity: **High**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: renewal has future `opens_at` with otherwise actionable enrollment.
- Reproduction before fix:
  1. Render RenewalEvent with `window.opens_at` in the future.
  2. Observe that only `closes_at` was read.
  3. Renewal remained actionable before its window.
- Expected: future open suppresses action and explains opening date; exact boundary is deterministic.
- Evidence: API declaration `src/components/RenewalEvent.tsx:6-10`; former only-close read `src/components/RenewalEvent.tsx:42-45`.
- Current source change: `opensAt`, `notOpen`, `windowClosed`, injectable `now`, and `canOpen` are derived. `src/components/RenewalEvent.tsx:26-75`.
- Verification still required: before/open-at/inside/close-at/after boundary and invalid/missing dates; interaction with complete/expired/revoked.
- Tags: `renewal-window`, `dead-api-surface`, `QA-DEF-001`.

## QA-DEF-011 — Admin empty and pending states are incomplete

- Severity: **Medium**
- Status: **FIXED-PENDING-FULL-VERIFICATION**
- Preconditions: operator sees empty data, slow requests, or repeats a control.
- Reproduction:
  1. Load empty catalog/audit or a found learner with no enrollments.
  2. Trigger learner search, question import/export, module/lesson save/create, resource upload, reorder, or support action on a delayed provider.
  3. Observe blank regions and/or no local pending disablement; repeated activation remains possible on several paths.
- Expected: every page has explicit empty state; every mutation/read has pending feedback and repeat-submit protection without hiding global result banners.
- Evidence: catalog `src/pages/AdminPages.tsx:106-119`; import `:228-269`; curriculum `:454-460`; learner `:601-618`; audit `:623-672`.
- Dependency: one shared async-control pattern could address the defect class without changing server logic.
- Tags: `admin-state-model`, `double-submit`, `empty-state`.

## QA-DEF-012 — Existing lesson resources are invisible in admin editor

- Severity: **Medium**
- Status: **OPEN**
- Preconditions: lesson already has one or more resources.
- Reproduction:
  1. Open its course editor.
  2. Locate the lesson resource area.
  3. Only upload fields are shown; existing titles/positions/file references are absent, so the operator cannot verify attachment after returning later.
- Expected: attached resources are listed with at least title/type/position; any management capability must follow the contract and audit requirements.
- Current source change: each lesson editor lists attached resources after the upload form, including title and private storage reference, plus an explicit empty state. `src/pages/AdminPages.tsx:351-367`.
- Verification still required: zero/one/multiple resources, refreshed visibility after upload, long references on mobile, and confirmation that no new delete/reorder capability was introduced.
- Tags: `admin-resources`, `catalog-presentation`, `authoring-verification`.

## QA-DEF-013 — Authenticated users can manually revisit login

- Severity: **Low**
- Status: **OPEN**
- Preconditions: valid learner or operator session.
- Reproduction:
  1. Enter `/login` directly.
  2. Login page renders because it is always public and LmsProvider bypasses data loading.
  3. User can submit credentials again instead of being redirected to their role home.
- Expected: product decision required: redirect authenticated roles to their home, or explicitly accept account-switch behavior and define it.
- Actual/evidence: public route `src/App.tsx:31-33`; public-route bypass `src/context/LmsContext.tsx:80-87`.
- Dependency: changing this may affect recovery/account switching; decide before implementation.
- Tags: `auth-route`, `session-redirect`, `product-decision`.

## QA-DEF-014 — Main application bundle exceeds the performance warning threshold

- Severity: **Medium**
- Status: **OPEN**
- Preconditions: production build of the current QA branch.
- Reproduction:
  1. Run `npm run build`.
  2. Inspect Vite's emitted asset sizes and warnings.
  3. The main application chunk is approximately 662 kB uncompressed and exceeds Vite's 500 kB warning threshold.
- Expected: route splitting and dependency boundaries keep initial learner-shell delivery within an explicit performance budget, or the measured deployed Core Web Vitals demonstrate and document why a different threshold is acceptable.
- Actual/evidence: baseline build emitted `dist/assets/index-CqT1LkVh.js` at 661.86 kB and printed the large-chunk warning; admin remains separately chunked, so the remaining weight is in the learner/common path. `qa/runs/2026-07-17.md`.
- Verification still required: final-build asset composition, deployed mobile cold-load metrics, repeated-navigation memory, and an agreed threshold for RA-14.
- Tags: `performance`, `bundle-size`, `RA-14`.

## QA-INC-001 — Walkthrough credential drift blocked sandbox login

- Severity: **High**
- Status: **OPEN**
- Scope: sandbox walkthrough account only; no password is recorded in this repository or ledger.
- Reproduction observed:
  1. Use the designated synthetic walkthrough email on the deployed login page.
  2. Enter the separately communicated walkthrough credential.
  3. Generic `Unable to sign in. Check your credentials and try again.` appeared because sandbox auth state had drifted from gate evidence.
- Expected: designated synthetic walkthrough identity remains login-capable for the human gate, with credential stored/communicated outside committed files.
- Prior resolution: sandbox password state was restored and sign-in was independently reported successful during the earlier incident response.
- Recurrence: on 2026-07-17 the separately communicated credential again produced the generic rejection on the deployed login screen. A read-only sandbox auth query confirmed that the account still exists, is confirmed, is not banned/deleted, has a password hash, and last signed in successfully earlier that day; this narrows the failure to credential drift/mismatch rather than a missing or disabled identity.
- Evidence: user-provided screenshot in the thread and read-only sandbox auth-state query; intentionally no secret, password hash, or password is copied here.
- Recurrence control: add a non-secret pre-walkthrough login smoke check and record only pass/fail, identity alias, timestamp, and sandbox ref—not the credential.
- Tags: `sandbox-fixture`, `credential-drift`, `walkthrough`.
