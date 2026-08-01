# M1 GATE REPORT — Learner Management + Operator Dashboard

Branch: `codex/m1-learners` · Head: `07ae773` · Date: 2026-08-01
Sandbox: `xfvaohvismisfdggfdfj` (the only Supabase project touched)
Edge function: `lms-admin` version 17, deployed and byte-verified against the repo.
Merge happens only on Jack's explicit "merge approved."

## What shipped

- **Migrations** (all applied to sandbox and committed):
  `20260801120000_m1_learner_management.sql` (notes table, audit indexes,
  stalled constant, canonical directory fn, dashboard counts, §4–§6/§8 RPCs),
  `20260801121000_m1_profile_audit_action.sql`,
  `20260801122000_m1_safeupdate_rider.sql`,
  `20260801123000_m1_stalled_constant_definer.sql`,
  `20260801124000_m1_review_fixes.sql` (pre-gate reviewer fixes).
- **Edge function `lms-admin`**: new actions `dashboard`, `list_learners`,
  `export_learners_csv`, `create_learner`, `update_learner_profile`,
  `send_password_reset`, `deactivate_learner`, `reactivate_learner`,
  `delete_learner`, `grant_enrollment`, `set_enrollment_expiration`,
  `revoke_enrollment`, `admin_complete_lesson`, `add_learner_note`,
  `import_learners`, `search_audit`; `inspect_learner` extended into the §3
  learner file (account state, notes, audit slice, CE-report inclusion).
  Byte-identical `progression.ts` copy added (enforced by
  `src/engine/engine-identity.test.ts`).
- **Admin UI**: dashboard is the operator landing route (`/admin`); Courses
  moved to `/admin/courses` (one click in nav); learner directory at
  `/admin/learners` with URL-param filters; learner file at
  `/admin/learners/:email`; single-email inspector retained at
  `/admin/learners/inspect`; bulk import at `/admin/import`; audit search at
  `/admin/audit`. New `NamedConfirmDialog` implements the type-the-email
  destructive confirm.

## Ratified design decisions (spec owner, 2026-08-01)

1. **Directory grain = one row per learner** — RATIFIED. §2 says
   "list of all learners" with a status value of `none`, which only exists at
   learner grain, and §0's tile-equals-filter-by-construction rule needs one
   grain. Consequence: the §1 "active enrollments" tile is labeled **"With
   active enrollment"** and counts *learners* holding ≥1 active enrollment
   (every tile is a learner population; each tile names its source object per
   the Absorb reporting lessons doc, rule 1).
2. **Extending a revoked enrollment past now restores access** — RATIFIED.
   The extension path restores (`status='active'` when the new date is
   future), the UI says so, and the audit row records old/new status.
3. **Certificate scope: FPT only** — RATIFIED BY DIRECTIVE and implemented
   pre-merge (commit noted below). Bonus courses do not award a certificate;
   renewal extends the FPT certificate dates per C1-SPEC (renewal
   certificates remain out of C1 scope — no separate certificate exists).
   The certificate panel and the /credentials artifact render ONLY for FPT
   completions. Non-FPT completions show completion state with no
   certificate affordance on both surfaces: the admin learner file renders
   "Completion recorded — this course does not issue its own certificate"
   with no View-certificate button or valid-through date, and the learner
   /completion page for a non-FPT course renders no credential reveal and no
   /credentials link (the learner /credentials page was already
   flagship-only). Coverage added asserting a non-FPT completion renders no
   certificate: `src/pages/AdminExperience.test.tsx` ("M1 ratified
   certificate scope — admin learner file", positive FPT case + negative
   renewal case) and `src/App.routes.test.tsx` ("M1 ratified certificate
   scope — FPT only", positive `/completion/fpt-sandbox` + negative
   `/completion/renewal-2026-sandbox`). Affected suites re-run green
   (107/107 across the two files); full suite re-run below.
4. **Which reads are audited** — RATIFIED as implemented: dashboard views
   (`view_dashboard`), learner file opens (`inspect_learner`), and CSV
   exports are audited reads; routine list pagination is not. The
   dashboard's recent-actions strip excludes the two read-audit actions so
   it shows operations; they remain in the ledger.
5. **§5 enrollment surface in LMS design language** — RATIFIED, recorded as
   M1-SPEC Amendment 1 (applied to `M1-SPEC.md` §5 on this branch): the
   reference-design sentence now reads "LMS design language as built
   (ratified); any restyle routes through the owner/leadership visual pass."
   The Hard Rule 1 fence sentence is unchanged. The command-center
   screenshot request is closed.

## §10 Gate evidence

**1. Dashboard as landing route; tile counts = linked filter counts.**
`/admin` renders the dashboard (route: `src/pages/AdminApp.tsx`; test
`App.routes.test.tsx` "renders the operator catalog…" now asserts the
dashboard heading). Every tile links to `/admin/learners?<filter>` and both
numbers come from the same `lms_admin_list_learners` call — equal by
construction (`lms_admin_dashboard_counts` calls the directory function with
each tile's filter). SQL cite (run at gate time, with 20 imported scratch
learners present; independent derivations written from base tables, not the
shared function):

| tile | RPC value | independent SQL | 
|---|---|---|
| total_learners | 28 | 28 |
| stalled | 4 | 4 |
| expiring_30 | 1 | 1 |
| completed_all | 3 | 3 |

Stalled independent query: active, incomplete enrollments with
`v_lms_person_progress.last_activity < now() - lms_stalled_threshold_days()`
— matched the tile exactly. Wet UI check: Stalled tile showed 4 → clicking it
opened the directory reading "4 learners match the current filters" listing
almostdone, failedquiz, fptcomplete, fresh.

**2. Directory filtered / sorted / paginated against museum + scratch.**
With 28 learners (6 museum + 20 imports + 2 scratch): `?sort=email&dir=desc`
showed "28 learners match · Page 1 of 2" with `m1-*` scratch rows first;
page 2 held `almostdone@…` etc. (screenshots
`/tmp/m1-evidence/directory-page1-sorted-desc.png`, `directory-page2.png`).
Stalled filter matches the canonical definition by the SQL cite in item 1;
the 14-day threshold lives in exactly one place:
`public.lms_stalled_threshold_days()`
(migration `20260801120000` — the directory fn, detail fn, and UI chip label
all read it).

**3. CSV export of a filtered view.** Filter `search="m1-import"` → screen
showed "20 learners match"; `export_learners_csv` with the same filter
returned 20 rows, `m1-import-001…020@example.test`, matching the on-screen
population (capture: `/tmp/m1-evidence/learner-directory-export.csv`).
Audited read rows naming the filter:
`lms_admin_actions` ids `6f7a645a…` (UI click) and `820a19c3…` — both
`action='export_learners_csv'`, `target.filters.p_search='m1-import'`,
`row_count=20`.

**4. Museum learner file read-only + scratch note.** Learner file for
`fresh@example.test` rendered identity/enrollments/completion panel; DB cite:
enrollments **9 = 9**, completions **0 = 0** (no certificate shown, blocker
chain shown), name "Fresh Learner", created 2026-07-16, notes 0 — all equal
to live rows. No mutation was performed on any fixture; fixtures received no
notes (final `lms_learner_notes` count for fixtures: 0). Support note added
to SCRATCH learner `m1-scratch-gamma@example.test` via UI, displayed newest
first with author + timestamp; audit row `add_learner_note`
(`note_id a0be23a7…`, 2026-08-01 20:58:25).

**5. Completion & certificate panel.** SCRATCH `m1-scratch-beta@example.test`:
before completion the panel showed "No completion record — no certificate
exists for this course," the nearest-blocker chain as the learner experiences
it ("Complete all required lessons in Module 1, then pass its quiz… Start
with '2026 Annual Update: Required video'"), the full remaining-requirements
list, and the §6 mark-complete action adjacent
(`/tmp/m1-evidence/beta-incomplete-blocker-chain.png`). After the audited
manual mark-complete (`manual_mark_complete`, `inserted:true`, enrollment
`745fd220…`) the panel immediately showed "Completed Aug 1, 2026 (manual
admin action) · valid through Aug 1, 2027", CE-inclusion pill "Not yet CE
reported", and View certificate rendered the C1 `CertificateArtwork` with
the learner's name and the same completed/valid-through derivation the
learner-side `CertificatePage` uses (`addOneYear(completed_at)`), with
Download/print (`/tmp/m1-evidence/beta-certificate-dialog.png`).

**6. Full §4 lifecycle on scratch `m1-scratch-alpha@example.test`** — each
step's audit row cited by id from `lms_admin_actions`:
- create (UI dialog; no password field exists; copy states the learner sets
  their own via reset): `ff89bb68` `create_learner` with the new profile
  values; DB row confirmed (learner role, profile Alpha Quill Scratch,
  cfp 700123).
- profile edit (middle → Quillon, CFP → 700124): `5f099ee4`
  `update_learner_profile` with old **and** new values.
- deactivate (named type-the-email confirm; button disabled until exact
  match): `1c5fc30b` `deactivate_learner` (old_banned_until null → 2036).
  **Sign-in blocked shown**: password grant returned
  `{"error_code":"user_banned"}`.
- reactivate: `51702e46` `reactivate_learner` (banned_until → null); the same
  sign-in attempt then returned `invalid_credentials` (block lifted).
- delete (named confirm): `961a6eb1` `delete_learner`; `auth.users` row gone,
  cascade per the FK graph introspected this session (`pg_constraint`:
  `lms_enrollments/lms_learner_profiles/lms_lesson_progress/lms_quiz_attempts/
  lms_survey_responses/lms_completion_events/lms_learner_notes` all cascade
  from `auth.users`/`lms_enrollments`).
- **Reset dispatch — WATCH ITEM, not proven** (Absorb lesson rule 3): the
  action calls GoTrue `/recover` and audits on success, and auth logs show
  `user_recovery_requested` firing — but GoTrue's email validator rejects
  every email shape the dark build permits (`…@example.test` and
  `test@example.com` both → `email_address_invalid`), so a successful
  dispatch cannot be observed in this sandbox. The UI correctly reported
  failure and wrote no audit row. First provable in an environment with real
  email domains.

**7. Delete guard refusal for a completed learner.** On completed SCRATCH
beta (not a fixture): UI shows "Deletion is not available… completion (or CE
reporting) records, which are permanent… Deactivate the account instead"
(`/tmp/m1-evidence/beta-delete-guard-refusal.png`), and the server refuses
independently: direct `delete_learner` call returned 400 "This learner has
completion or CE reporting records and cannot be deleted." Guard:
`lms_admin_delete_learner_guard` (completions count + CE-report rows scan).

**8. §5 lifecycle on scratch gamma.** Grant (UI course picker, expiration
defaulting to one year: 2027-08-01) → audit `grant_enrollment` 20:42:34 for
`fpt-sandbox` with `bonus_enrollment_granted:true` (same
`lms_grant_enrollment` path the launch webhook will use; FPT grant
provisioned all six bonus enrollments). Extend 2027-08-01 → 2027-12-31 →
audit `set_enrollment_expiration` 20:57:55 with old and new values. Revoke
(named confirm) → audit `revoke_enrollment` 20:58:14, `status='revoked'`,
`expires_at=now()`, progress rows untouched. Two-clock copy visible in the
UI: "Course access only — the CBDA designation clock is governed separately
and is not changed by this" (`/tmp/m1-evidence/gamma-two-clock-expiration.png`).

**9. §6 single-lesson complete unlocking downstream state.** Gamma, Renewal
2026 (1 module: required video + quiz). Learner-side BEFORE (logged in as the
scratch learner): quiz entry read "**Opens when this module's lessons are
complete.**" (`gamma-quiz-locked-before.png`). Admin `admin_complete_lesson`
on the video → RPC `lms_admin_complete_lesson` validated course membership,
set `completed_at` **only** (`max_watched_seconds` stayed 0 — no fabricated
video positions), audit row `admin_complete_lesson` 20:45:04; the edge
function then re-ran the byte-identical engine's `courseComplete` —
`completion_fired:false` (quiz outstanding — correct; a completion event is
inserted only when the engine says the course is complete, and that insert
now writes its own `completion_event_recorded` audit row). Learner-side
AFTER: "**Start the quiz**" (`gamma-quiz-unlocked-after.png`). Engine-path
proof: the unlock derivation is the deployed `progression.ts`, byte-identical
to `src/engine/progression.ts` by the identity test; surveys are refused at
the RPC (immutable by design, F3).
*Harness disclosure:* to observe learner-side state I set the scratch
learner's password by direct SQL (scratch account only, deleted at session
end) — @example.test addresses cannot receive the reset email.

**10. §7 import.** Mixed CSV (20 valid + 7 invalid rows) through the UI:
dry-run preview showed "20 valid rows, 7 named rejections" with F4-style
row/field/reason lines — `22/email/must be a valid email address`,
`23/first/is required`, `24/course/unknown course slug`,
`25/expiration/must be a YYYY-MM-DD date`,
`26/email/duplicates an earlier row for the same course`,
`27/course/already enrolled in this course`,
`28/first/name conflicts with the existing profile for this email` — and
nothing written. Commit: "20 accounts created, 20 enrollments granted, 7
rejections"; DB cite: 20 users, 20 enrollments, audits = 20 `create_learner`
+ 20 `grant_enrollment` + 1 `bulk_import` summary. **Idempotent re-run** of
the same CSV: "0 valid rows, 27 named rejections" — existing accounts
matched, zero writes. **Cleanup**: all 20 imports deleted through the §4
delete action (each audited); final scratch residue query = 0 rows.

**11. §8 audit search.** 214 actions, server-paginated ("Page 1 of 5",
50/page), actor shown as resolved email everywhere. Filter action-type
`grant_enrollment` + target `m1-scratch-gamma@example.test` → exactly the 2
matching grants (`audit-search-filtered.png`). Target matching resolves
`email`/`person_email` keys plus enrollment-id and auth-user-id targets; the
§3 learner-file slice uses exact-match semantics (`p_target_exact`).

**12. Grants proof.** All 11 new/replaced functions:
`prosecdef=true`, `proconfig=search_path=""`, **zero** grants to
anon/authenticated/PUBLIC, `service_role` granted (pg_proc +
`routine_privileges` cite in-session; includes the pre-existing
`lms_admin_find_auth_user_by_email` and `lms_grant_enrollment` this phase
calls). `lms_learner_notes`: RLS enabled **and forced**, zero
anon/authenticated grants. Zero new client-side write paths — every UI write
goes through `adminRequest` → `lms-admin` (operator-gated) → RPC/auth admin
API. No gate artifact contains the production ref; working-tree forbidden-ref
scan: **0 matches**.

**13. Suite / lint / build / scan.**
`npm test`: **35 files, 273 tests, all passing** (includes new
`learnerImportCsv` tests, updated route tests, engine-identity now covering
the lms-admin copy). `npm run lint` (tsc): clean. `npm run build`: clean.
Forbidden-ref scan: 0. Branch `codex/m1-learners`, head `07ae773`.

## Pre-gate fresh-context review (disclosed per session protocol)

A subagent given ONLY `M1-SPEC.md` and the staged diff reviewed the branch.
Its findings, verbatim headlines, with dispositions:

**Resolved before this gate (commit `07ae773`, migration `20260801124000`, edge v17):**
- **A1** "Unaudited direct table write of a completion event" → the
  admin-path completion insert now writes a `completion_event_recorded`
  audit row naming the actor.
- **A2** "Bulk import audits profile writes on existing accounts as
  `create_learner`" → audit action now truthfully `create_learner` vs
  `update_learner_profile`.
- **A3** "Import overwrites existing profile data, including erasing CFP
  Board IDs" → matched accounts are never profile-overwritten; the profile
  is written only for new accounts or empty profiles.
- **A4** "Profile edit clobbers `display_name`" → learner-customized display
  names are preserved; the derived value is written only on insert/empty/
  previously-derived.
- **A5** "Learner-file audit slice uses substring matching" → slice now uses
  exact-target matching (`p_target_exact=true`); §8 search keeps substring.
- **C3** "create_learner is non-atomic: auth user can be created with no
  profile and no audit row" → compensating auth-user delete on profile-write
  failure (create action and import loop).
- **C7** "view_dashboard audit row pollutes the dashboard's own
  recent-actions strip" → strip excludes read-audit actions; ledger keeps them.

**Retained, with reasons:**
- **A6** CSV columns are a superset of the list columns → retained: the list
  columns are all present and in order; the extra columns (cfp_id, account
  state, completion fields) are the §2 export's operational point. Flagged
  for ratification.
- **B1** "`lms_admin_find_auth_user_by_email` … never defined in this diff"
  → pre-exists from F1 (`20260717003000`); grants verified this session
  (definer, pinned path, service-role-only) and cited in item 12.
- **B2** cascade introspection not evidenced in diff → performed this
  session via `pg_constraint` (full FK graph in item 6) before the delete
  path was written.
- **B3** "No automated tests for any of the new M1 surfaces" → retained as
  an accepted M1 gap: coverage here is the wet-proof suite above plus the
  engine-identity/route/CSV tests; UI tests for the new pages are follow-on
  work. Honest gap.
- **B4** only the email cell links to the learner file → retained: an
  explicit link beats a whole-row click target for keyboard/screen-reader
  use; can widen on request.
- **C1** "Stalled definition excludes learners with zero activity ever" →
  rebutted: `v_lms_person_progress.last_activity` is
  `GREATEST(enrolled_at, …)` and the view row exists for every enrollment,
  so it is never NULL; a never-started learner stalls 14 days after
  enrollment (fresh@ counted stalled in item 1 is exactly this case).
- **C2** audit search inner-join drops deleted actors → rebutted:
  `lms_admin_actions.actor_auth_user_id` has a non-cascading FK to
  `auth.users`, so an actor with audit rows cannot be deleted; rows cannot
  orphan.
- **C4** duplicate-completion guard depends on an unverified unique
  constraint → verified: `lms_completion_events.enrollment_id` is UNIQUE
  (schema migration; `manual_mark_complete`'s `on conflict (enrollment_id)`
  depends on it too).
- **C5** import does per-row round-trips; timeout risk on large files →
  retained: 1000-row cap; W1 should batch launch imports (~200 rows/file
  recommended). Flagged for W1.
- **C6** reset uses `resetPasswordForEmail`, not the admin API → retained
  deliberately: `admin.generateLink` *returns the token to the caller*,
  which §4 forbids surfacing; the /recover endpoint dispatches without ever
  exposing a token. Recorded disposition.
- **C8** certificate expiration client-computed as +1 year → retained: it is
  the exact `addOneYear(completed_at)` the learner-side C1 page uses, so the
  artifacts cannot diverge today; consolidating into one shared helper is a
  cleanup item.
- **C9** base migration's bare DELETE superseded by the TRUNCATE rider →
  retained: replays apply migrations contiguously, so no environment can
  call the function between the two; the applied ledger and repo agree.
- **C10** set-expiration silently un-revokes → flagged above as
  ratification item 2.
- **D1–D8** design concerns → D1 is ratification item 1; D2 (operators
  invisible in the directory) is intended and now stated; D3 (two CE-
  inclusion definitions) accepted for M1 scale, unify in M2; D4 (dashboard
  cost O(10× users)) accepted at launch volume, materialize before M2
  analytics; D5 (action-type dropdown seeded from recent snapshot) minor,
  free-text actor/target still reach everything; D6 (notes author FK blocks
  out-of-band operator deletion) acknowledged; D7 (byte-identity "by comment
  only") rebutted — `src/engine/engine-identity.test.ts` enforces it in the
  suite; D8 print-as-download matches the learner-side C1 behavior exactly.

## Watch items & session observations

1. **Password-reset dispatch is unprovable in the dark build** (item 6) —
   carry as a promotion-checklist item: verify one real dispatch in the
   production environment before launch.
2. **Supabase CLI on this machine is authenticated account-wide** and its
   project listing includes the production project. The CLI was not used for
   any operation this session (one `projects list` during tool discovery
   revealed this); all sandbox work went through the MCP, which is scoped to
   the sandbox only. No production ref appears in any artifact.
3. **Harness steps disclosed**: scratch learner password set by SQL (item 9);
   completed scratch actor `m1-scratch-beta` removed by direct SQL because
   the §4 guard correctly refuses completed learners and completions are
   append-only — the museum is back at exact contract state (8 auth users, 6
   directory learners, 2 completions, 0 notes, 0 bans, 0 scratch residue).

## State museum attestation

Fixture actors were read but never re-staged, reseeded, mutated, or
annotated. Final checks: exactly the 8 contract users remain; completions =
the 2 pre-session events (almostdone, fptcomplete); `lms_learner_notes`
empty; no banned users; directory total = 6.

**STOP. Awaiting review. Merge only on "merge approved."**
