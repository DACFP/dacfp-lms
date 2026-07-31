# M1-SPEC — LEARNER MANAGEMENT (DACFP/dacfp-lms)

STATUS: Commit as M1-SPEC.md at the repo root. Runs AFTER C1 merges.
Governed by SPEC.md v3.2 Hard Rules. Branch: codex/m1-learners.

## §0 PRINCIPLES (load-bearing, restated from the platform contract)
- Learning access and designation status are governed separately.
  Every action in this spec touches course access only. Nothing here
  reads or writes designation status, and no UI copy may imply it.
- Every write lands through an operator-gated, service-role-only,
  audited RPC or the auth admin API called from the lms-admin edge
  function. Zero new client-side write paths. Zero new table grants
  to authenticated. RLS posture is untouched.
- Every mutating action writes one lms_admin_actions row naming the
  actor, action, and target. Destructive actions require the named
  confirmation pattern (type the learner email to confirm).
- Exam law (Hard Rule 12) is untouchable: no action may alter quiz
  policy, pass thresholds, or attempt limits.

## §1 LEARNER DIRECTORY (replaces single-email lookup as the
Learners landing surface; the single-email inspector remains
reachable from it)
- Server-side paginated list of all learners: email, name, course,
  progress summary, enrollment status (active / expired / none),
  expiration date.
- Filters: free-text email/name search, course, status, expiration
  window (next 30/60/90 days). Sort by email, expiration, progress.
- Row click opens the learner detail page (§2).

## §2 LEARNER DETAIL PAGE
- Header: identity (email, full name incl. middle, CFP Board ID),
  account state (active / deactivated), created date.
- Enrollment panel per enrollment: course, enrolled date, expiration,
  status, progress breakdown as the existing inspector shows, plus
  certificate state (links to the C1 certificate view when complete)
  and CE reporting status.
- Action rail exposing §3-§5 actions applicable to the learner.
- That learner's slice of the audit trail (actions where they are
  the target), newest first.

## §3 ACCOUNT ACTIONS (all audited)
- Create learner: email, first, middle (optional), last, CFP Board
  ID (optional). Creates the auth user provisioned for the LMS and
  its profile row. No password is ever displayed or set by the
  operator; the learner sets it via the reset flow.
- Edit profile fields: first, middle, last, CFP Board ID. Email
  change is OUT OF SCOPE for M1.
- Send password reset: triggers the auth reset email through the
  auth admin API. UI confirms dispatch, never shows tokens.
- Deactivate / reactivate: deactivation blocks sign-in through the
  auth admin API ban mechanism, is reversible, and deletes nothing.
  Deactivated learners remain fully visible in §1/§2.
- Delete learner: permitted ONLY when the learner has zero
  completion events and zero CE report inclusion; otherwise the UI
  offers deactivation and explains why. Named destructive confirm.
  Cascade behavior must match the platform FK graph; the session
  introspects before writing the RPC.

## §4 ENROLLMENT ACTIONS (all audited)
- Grant enrollment: course picker; creates the enrollment through
  the same underlying grant path the launch webhook will use
  (lms_grant_enrollment), with explicit expiration date input
  defaulting to one year from grant.
- Set / extend expiration: date input with the current value shown;
  writes a new expiration and audits old and new values.
- Revoke access: ends the enrollment (expired-now semantics), never
  deletes progress history. Named confirm.

## §5 PROGRESS INTERVENTIONS (all audited)
- Existing actions remain: manual mark course complete, named
  attempt resets.
- New: mark a single lesson complete (support case: learner blocked
  by a playback or tracking failure). Writes through the progression
  engine path so downstream unlock state stays consistent; never
  fabricates video positions.
- Survey responses remain immutable by design (F3). No clear or
  edit action exists. OUT OF SCOPE permanently absent a spec change.

## §6 BULK IMPORT (launch-critical; W1 references this section)
- CSV import: email, first, middle, last, cfp_board_id, course,
  expiration. Creates accounts (§3 semantics) and enrollments (§4
  semantics) in one pass.
- Per-row validation with named rejections in the F4 importer style
  (row number, field, reason). Dry-run preview before commit.
  Idempotent by email: existing accounts are matched, not
  duplicated; conflicting rows are named rejections, not writes.
- Progress placement for migrated mid-course learners is OUT OF
  SCOPE here; it is W1 business using §5 primitives.

## §7 AUDIT TRAIL UPGRADES
- Search by actor, action type, and target email; server-side
  pagination; actor shown as email (resolved) not UUID. Read-only.

## §8 OUT OF SCOPE
- Impersonation / view-as-learner (routed backlog).
- Email change, designation records, verification pages, Credly or
  HubSpot writes, any command-center object.
- Any change to fixture actors: the state museum is CONTRACT state.
  All wet proofs use scratch learners created and deleted through
  this spec's own §3 actions within the session.

## §9 GATE EVIDENCE (numbered)
1. Directory: filtered and paginated states shown against the
   museum plus scratch learners.
2. Detail page for a museum actor, read-only, matching live DB
   values by SQL cite.
3. Full §3 lifecycle on a scratch learner: create → profile edit →
   reset dispatched → deactivate (sign-in blocked shown) →
   reactivate → delete, each with its audit row cited by SQL.
4. Delete guard shown refusing a completed learner (use a scratch
   learner completed via §5, not a fixture).
5. §4 lifecycle on a scratch learner: grant → extend → revoke, with
   audit rows and two-clock copy visible in UI.
6. §5 single-lesson complete shown unlocking downstream state
   correctly, with engine-path proof (no direct table write).
7. §6 import: dry-run preview, a mixed valid/invalid CSV producing
   named per-row rejections, idempotent re-run proof, and full
   cleanup of scratch imports.
8. §7 search and pagination shown; actor emails resolved.
9. Grants proof: every new RPC service-role-only with pinned
   search_path; zero new authenticated/anon grants (SQL cite).
10. Suite green; lint, build, forbidden-ref scan clean; branch and
    commit hash.
