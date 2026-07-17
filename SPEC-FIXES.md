# DACFP-LMS — FIX-PHASE SPEC (F1 + F2) — audit remediation

STATUS: Standing addendum to SPEC.md v3.1. Commit this file to the repo
root as SPEC-FIXES.md. SPEC.md remains the governing contract; Hard
Rules 1–12 and every standing rule (sandbox-only, attestation line,
secrets, one-session-one-branch, merge only on Jack's "merge approved")
apply to every F session unchanged.

ORIGIN: Findings from the two-sided audit at commit 84e37e4 — Fable
codebase audit (H/M/L/N numbering) + database-side audit (DB-1..3).
Each item below carries its finding ID; the audit reports are the
detailed reference. Fix exactly what is named; no opportunistic
refactors (Hard Rule 11 applies to fixes too).

SEQUENCE: F1 (server + database) → F2 (frontend defect class) →
Jack's v2 overhaul (design/UX, separate later effort, NOT part of
these sessions) → promotion spec. Audit items assigned to the
overhaul or promotion are explicitly OUT of F-scope and listed in §4.

---

## 1. PHASE F1 — server + database (one session, branch codex/f1-server)

### 1a. Completion detector on the lesson path (H-1 — the spec deviation)
After any successful heartbeat write that newly sets completed_at, and
after any successful complete_reading, lms-progress evaluates
courseComplete per §3 using the shared engine and, if true, inserts
lms_completion_events idempotently (insert, tolerate unique violation
— same behavior as lms-grade-attempt). Response gains
completion_fired. Wet proof required: the Bonus Sandbox course (open,
quiz-less) completed purely through lessons fires exactly one event.

### 1b. Server-stamped terms acceptance (H-8)
New security definer function lms_accept_terms(p_course_id): stamps
terms_accepted_at = now() on the caller's own active enrollment ONLY
if currently null; executable by authenticated; never accepts a
client-supplied timestamp; cannot null an existing value. Migration
also REVOKES update(terms_accepted_at) on lms_enrollments from
authenticated and drops/narrows the update-own policy accordingly.
Provider switches acceptTerms to the RPC. Negative proof: a learner
session attempting direct UPDATE of terms_accepted_at is denied; a
second lms_accept_terms call is a no-op.

### 1c. Hard Rule 12 as constraints (M-9)
Migration adds CHECK (pass_pct = 70) and CHECK (question_count = 10)
to lms_module_quizzes. Verify the seed and all shipped write paths
still pass (they hardcode 70/10 already).

### 1d. Atomic admin audit logging (M-2)
Every lms-admin CRUD mutation becomes mutation+audit in one
transaction: move each into a security definer SQL function that
writes lms_admin_actions in the same transaction (pattern already used
by reorder/import/support actions), or equivalent single-transaction
mechanism. No mutation may commit without its audit row.

### 1e. Player-server contract repairs (M-3, M-4, M-5 server half)
- M-3: SIGNED_URL_TTL_SECONDS raised to 21600 (6h — comfortably above
  any lesson length); lms-playback-token response unchanged in shape.
  (Client refresh behavior is F2; server just stops forcing 20s
  cycles.)
- M-4: plausibility elapsed measured from a timestamp that only
  advances when max_watched_seconds grows (new column
  max_watched_updated_at or equivalent), so a second idle tab cannot
  shrink the watching tab's window. Spoof rejection proof re-run.

### 1f. Shared engine everywhere (M-1)
lms-progress, lms-playback-token, and lms-resource-token drop their
hand-rolled prerequisite/terms/unlock/95% logic and build a
ProgressionContext + call the shared progression.ts (byte-identical
copy discipline per existing pattern). Behavior must not change;
existing gate evidence scenarios re-run as regression proof.

### 1g. Grading logic extracted and tested (H-11 server half, N-6)
- Extract normalizeAnswers, exactSetMatch, and attempt-number retry
  logic from lms-grade-attempt into pure modules with vitest coverage:
  malformed answers (non-array, foreign question id, foreign choice
  id, duplicate choices), exact-set boundary cases, weighted points,
  retry-on-23505 behavior (mocked).
- New test: byte-compare src/engine/progression.ts against every
  supabase/functions/*/progression.ts copy (N-6) — the identity
  guarantee becomes executable.

### 1h. Database riders (DB-1, DB-2, DB-3)
One migration: DROP FUNCTION public.rls_auto_enable() (sandbox drift,
in no repo migration — dropping via tracked migration makes the repo
the truth); rewrite the four D2-era policies
(lms_enrollments_select_own/update_own,
lms_lesson_progress_select_own, lms_quiz_attempts_select_own,
lms_completion_events_select_own) wrapping auth.uid() as
(select auth.uid()); add covering indexes for the eight advisor-flagged
FKs. Advisor re-run pasted as proof (initplan warnings gone;
rls_auto_enable gone).

### 1i. Small server hygiene riders (L-3, L-4, L-5, L-6, L-1)
prerequisite_course_id requiredUuid-validated + self-reference
rejected in lms-admin; inspectLearner queries auth user by email
instead of listing 1,000; base64 size check before decode; unguarded
req.json() in lms-resource-token and lms-admin import path gains the
.catch(() => ({})) pattern → 4xx not 500; client tripwire (L-1)
switched from substring '"correct"' to detecting a correct KEY on
question objects (provider change, included here because it pairs
with grading).

### F1 GATE EVIDENCE
1. All migration SQL in full; both modified function sources in full
2. Bonus-course lesson-only completion wet run → exactly one event
3. Terms negative tests (direct UPDATE denied; RPC idempotent;
   timestamp is server now())
4. CHECK constraints proven (a service-role insert of pass_pct 60 is
   rejected)
5. Atomicity proof for one CRUD action (audit insert forced to fail →
   mutation rolls back)
6. Two-tab heartbeat scenario no longer false-rejects; spoof still
   rejected
7. Advisor re-run: initplan clean, rls_auto_enable absent, FK indexes
   present
8. New test suite output (engine-identity test + grading module
   tests) — full suite green
9. Regression re-run of D3/D4 gate scenarios (unlock, grade, token
   denial paths)
10. Pushed branch + commit hash

## 2. PHASE F2 — frontend defect class (one session, branch codex/f2-frontend)

### 2a. LessonPlayer lifecycle (H-2, H-3, M-5 client half)
key={lesson.id} (or full ref reset on lesson change) so watermark,
resume, and seek clamp never carry across lessons; token-refresh
timer/fetch guarded by an active flag or AbortController so nothing
survives unmount; trailing heartbeat queued when one is in flight and
flushed on pause/unmount. With F1's 6h TTL, refresh becomes rare —
keep the refresh path but it must never swap src mid-playback unless
the token actually expired.

### 2b. Mutation/refresh decoupling — kill the class (H-4, H-5, H-6, M-6, M-7)
One shared mutation-status helper used by EVERY learner and admin
mutation: mutation failure and refresh failure are distinguished; on
refresh failure the existing snapshot is KEPT (never nulled) with a
non-destructive retry banner; every admin mutation surfaces
success/error (no void/fire-and-forget, no unhandled rejections);
upload_resource captures the form element before await (H-5); admin
refresh failure renders a banner when a snapshot exists (M-6);
password-reset distinguishes transport failure from the
anti-enumeration success (M-7). The false "Your answers were not
changed" copy dies.

### 2c. Interim single-answer rendering (H-7 interim ONLY)
Server: lms-get-quiz derives select_kind ('single' when the answer
key has exactly one id, else 'multi') into the public payload —
no key contents exposed. Client: radios + "Select one" for single,
checkboxes + "Select all that apply" only for multi. The one-per-
screen stepper remains OVERHAUL scope — do not build it here.

### 2d. Small correctness riders (L-7, L-8, L-9)
Attempt history uses possible_points denominator; expired-with-null-
expiry renders no 1970 date; auth listener ignores stale getSession
resolution after any auth event.

### F2 GATE EVIDENCE
1. Player: cross-lesson navigation shows fresh watermark/resume per
   lesson (before/after demonstration); unmount leaves zero timers
   (instrumented proof or code-level demonstration)
2. Mutation matrix: every learner + admin mutation listed with its
   success and failure surface; one forced-failure demo each side
   showing banner + preserved snapshot
3. upload_resource succeeds AND reports success
4. Quiz renders radios for the (all-single) sandbox content;
   select_kind visible in payload; no correct leakage (re-paste)
5. Full suite green (all F1 tests included); pushed branch + hash

## 3. VERIFICATION
Same three legs per phase: Codex evidence → Claude independent
source + database verification (including advisor re-run and function
bridge checks) → Jack's approval phrase. F2 additionally gets a short
Jack walkthrough (quiz radios, a failed-mutation banner, cross-lesson
player behavior).

## 4. EXPLICITLY OUT OF F-SCOPE (assigned elsewhere, do not touch)
- Jack's v2 overhaul (AFTER F1+F2, separate effort): H-9, H-10, M-8
  stepper, M-12 code-splitting, M-13 palette, M-14 copy branch, all
  L-12/L-13 hygiene, all 22 UI Overhaul Brief inputs, M-10
  listLearners/?learner= removal, N-7 sandbox-vocabulary purge,
  ESLint adoption.
- Promotion spec: N-2 (auth Admin API in lms_grant_enrollment), N-3
  (real answer keys), L-2 (CORS origin pinning), leaked-password
  toggle, M-11 full typecheck/CI pipeline (the F1 tests are the
  down payment; CI lands with promotion).
