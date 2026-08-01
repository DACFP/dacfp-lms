# M1-SPEC v3 — LEARNER MANAGEMENT + OPERATOR DASHBOARD
(DACFP/dacfp-lms)

STATUS: Commit as M1-SPEC.md at the repo root. Runs AFTER C1 merges.
Governed by SPEC.md v3.2 Hard Rules. Branch: codex/m1-learners.

## §0 PRINCIPLES (load-bearing, restated from the platform contract)
- Learning access and designation status are governed separately.
  Every action in this spec touches course access only. Nothing here
  reads or writes designation status, and no UI copy may imply it.
- Certificates are DERIVED artifacts: a certificate exists if and
  only if a completion record exists. There is no certificate
  issuance path independent of completion. The admin route to a
  certificate for an incomplete learner is the audited manual
  mark-complete action, after which the certificate is live.
- Every write lands through an operator-gated, service-role-only,
  audited RPC or the auth admin API called from the lms-admin edge
  function. Zero new client-side write paths. Zero new table grants
  to authenticated. RLS posture is untouched.
- Every mutating action writes one lms_admin_actions row naming the
  actor, action, and target. Destructive actions require the named
  confirmation pattern (type the learner email to confirm).
- Exam law (Hard Rule 12) is untouchable: no action may alter quiz
  policy, pass thresholds, or attempt limits.
- Dashboard and directory numbers must derive from the same
  canonical queries; a count shown on a tile must equal the row
  count of the filter it links to. No independently drifting math.

## §1 OPERATOR DASHBOARD (the admin landing page)
- The operator default route becomes the dashboard, not Courses.
  Courses remains one click away in the existing nav.
- Tiles, each a live count linking to the §2 directory pre-filtered
  to exactly that population: total learners · active enrollments ·
  in progress · completions (last 30 days and all time) · expiring
  in 30 / 60 / 90 days · stalled learners (§2 definition) ·
  deactivated accounts.
- A recent-activity strip: latest completions and latest admin
  actions, each row linking to the learner file.
- Counts are computed server-side through audited read paths; no
  client-side aggregation over full-table fetches.

## §2 LEARNER DIRECTORY (replaces single-email lookup as the
Learners landing surface; the single-email inspector remains
reachable from it)
- Server-side paginated list of all learners: email, name, course,
  progress summary, enrollment status (active / expired / none),
  expiration date, last activity date.
- Filters: free-text email/name search, course, status, expiration
  window (30/60/90 days), stalled. Sort by email, expiration,
  progress, last activity.
- STALLED definition (canonical, shared with §1): an active,
  incomplete enrollment with no progress activity in the last 14
  days. The threshold is a named constant in one place.
- CSV EXPORT: one action exports the currently filtered and sorted
  view (same columns as the list). Export is an audited read action
  naming the filter used. Row click opens the learner file (§3).

## §3 LEARNER FILE (detail page — the expansive, single-screen
answer to who this person is, where they stand, and what to do)
- Header: identity (email, full name incl. middle, CFP Board ID),
  account state (active / deactivated), created date.
- COMPLETION & CERTIFICATE PANEL: every completion event (course,
  completion date, expiration date) with a view/download certificate
  action rendering the same C1 artifact the learner sees; CE-report
  inclusion status per completion. For incomplete enrollments the
  panel shows the exact remaining requirements (the nearest-blocker
  chain as the learner experiences it) with the §6 mark-complete
  action adjacent. No completion record = no certificate anywhere,
  per §0.
- Enrollment panel per enrollment: course, enrolled date, expiration,
  status, progress breakdown as the existing inspector shows.
- SUPPORT NOTES: free-text notes on the learner, newest first, each
  stamped with author email and time. Notes are append-only records
  in a service-role-only table; adding a note is an audited write.
  No edit or delete in M1.
- Action rail exposing §4-§6 actions applicable to the learner.
- That learner's slice of the audit trail (actions where they are
  the target), newest first.

## §4 ACCOUNT ACTIONS (all audited)
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
  Deactivated learners remain fully visible in §1-§3.
- Delete learner: permitted ONLY when the learner has zero
  completion events and zero CE report inclusion; otherwise the UI
  offers deactivation and explains why. Named destructive confirm.
  Cascade behavior must match the platform FK graph; the session
  introspects before writing the RPC.

## §5 ENROLLMENT ACTIONS (all audited)
- Reference design: LMS design language as built (ratified); any
  restyle routes through the owner/leadership visual pass.
  [Amendment 1] This is a DESIGN reference only — zero code,
  identifiers, endpoints, or configuration may be copied from the
  command-center repo, and Hard Rule 1 applies in full. The session
  builds against LMS objects exclusively, from screenshots or
  written description supplied in the session.
- Grant enrollment: course picker; creates the enrollment through
  the same underlying grant path the launch webhook will use
  (lms_grant_enrollment), with explicit expiration date input
  defaulting to one year from grant.
- Set / extend expiration: date input with the current value shown;
  writes a new expiration and audits old and new values.
- Revoke access: ends the enrollment (expired-now semantics), never
  deletes progress history. Named confirm.

## §6 PROGRESS INTERVENTIONS (all audited)
- Existing actions remain: manual mark course complete, named
  attempt resets. Manual mark complete is the sole admin path to a
  certificate for an incomplete learner, per §0; the resulting
  certificate appears in the §3 panel immediately.
- New: mark a single lesson complete (support case: learner blocked
  by a playback or tracking failure). Writes through the progression
  engine path so downstream unlock state stays consistent; never
  fabricates video positions.
- Survey responses remain immutable by design (F3). No clear or
  edit action exists. OUT OF SCOPE permanently absent a spec change.

## §7 BULK IMPORT (launch-critical; W1 references this section)
- CSV import: email, first, middle, last, cfp_board_id, course,
  expiration. Creates accounts (§4 semantics) and enrollments (§5
  semantics) in one pass.
- Per-row validation with named rejections in the F4 importer style
  (row number, field, reason). Dry-run preview before commit.
  Idempotent by email: existing accounts are matched, not
  duplicated; conflicting rows are named rejections, not writes.
- Progress placement for migrated mid-course learners is OUT OF
  SCOPE here; it is W1 business using §6 primitives.

## §8 AUDIT TRAIL UPGRADES
- Search by actor, action type, and target email; server-side
  pagination; actor shown as email (resolved) not UUID. Read-only.

## §9 OUT OF SCOPE (recorded dispositions)
- M2 (next spec, committed separately): per-question quiz analytics
  and the survey response browser/export — deferred because both
  gain meaning with real learner volume; primitives here must not
  preclude them.
- Enrollment keys / vouchers for firms: routed to the executive
  packet as a channel and pricing decision before any build.
- Role management UI and firm tagging on learners: post-launch;
  firm tagging is decided with the firm-typeahead question.
- Impersonation / view-as-learner (routed backlog).
- Email change, designation records, verification pages, Credly or
  HubSpot writes, any command-center object or identifier.
- Any change to fixture actors: the state museum is CONTRACT state.
  All wet proofs use scratch learners created and deleted through
  this spec's own §4 actions within the session.

## §10 GATE EVIDENCE (numbered)
1. Dashboard as the operator landing route; every tile's count
   shown equal to its linked filtered directory count (SQL cite for
   at least three tiles including stalled).
2. Directory: filtered, sorted, and paginated states shown against
   the museum plus scratch learners; stalled filter matches the
   canonical definition by SQL cite.
3. CSV export of a filtered view: file contents shown matching the
   on-screen rows; the audited read row cited.
4. Learner file for a museum actor, read-only, matching live DB
   values by SQL cite; support note added to a SCRATCH learner with
   its audit row (fixtures receive no notes).
5. Completion & certificate panel: certificate opened and rendered
   from the admin learner file for a completed SCRATCH learner
   (completed via §6, certificate identical to the learner-side C1
   view); shown correctly absent, with the blocker chain displayed,
   for an incomplete scratch learner.
6. Full §4 lifecycle on a scratch learner: create → profile edit →
   reset dispatched → deactivate (sign-in blocked shown) →
   reactivate → delete, each with its audit row cited by SQL.
7. Delete guard shown refusing a completed learner (use a scratch
   learner completed via §6, not a fixture).
8. §5 lifecycle on a scratch learner: grant → extend → revoke, with
   audit rows and two-clock copy visible in UI.
9. §6 single-lesson complete shown unlocking downstream state
   correctly, with engine-path proof (no direct table write).
10. §7 import: dry-run preview, a mixed valid/invalid CSV producing
    named per-row rejections, idempotent re-run proof, and full
    cleanup of scratch imports.
11. §8 search and pagination shown; actor emails resolved.
12. Grants proof: every new RPC and table service-role-only with
    pinned search_path; zero new authenticated/anon grants (SQL
    cite).
13. Suite green; lint, build, forbidden-ref scan clean; branch and
    commit hash.

## AMENDMENTS
- Amendment 1 (2026-08-01, ratified by the spec owner): §5's
  reference-design sentence originally read "match the
  command-center enrollment page's layout and flow." It now reads
  "LMS design language as built (ratified); any restyle routes
  through the owner/leadership visual pass." The Hard Rule 1 fence
  sentence in that bullet is unchanged.
