# DACFP-LMS — DARK BUILD SPEC v3.1 (standing reference for all Codex sessions)

This document is the contract for every session in this repo. Read it fully
before writing code. Where a session prompt and this spec conflict, STOP and
flag the conflict — do not improvise a resolution.

v3.1 supersedes all prior versions. Changes from v2: real FPT structure
confirmed (14 modules); exam policy confirmed as PUBLICLY MARKETED (locked
hard); CE credits confirmed as part of the product → ce_credits modeling +
credential ID collection; lesson resources table; optional per-course terms
acknowledgment. v3.1 change: Hard Rule 1 rewritten in allowlist form — the
production project ref is deliberately not written anywhere in this file,
so the repo can be audited to contain no trace of it. Repo is
DACFP/dacfp-lms.

---

## 0. HARD RULES (non-negotiable, every session)

1. **One database, and it is the SANDBOX.** The ONLY Supabase project ref
   permitted to appear anywhere in this repository — config, .env files,
   comments, migrations, docs, or any session's MCP/tool calls — is the
   sandbox ref `xfvaohvismisfdggfdfj`. Any other Supabase project ref,
   anywhere, is a violation: STOP and flag. DACFP's production project is
   out of bounds and its ref is intentionally NOT written in this file, so
   the entire repo can be audited to contain zero trace of it; session
   prompts may name that ref solely so it can be grepped for and its
   absence proven.
2. **This is a dark build.** No real learner data, no real member emails,
   no production secrets, no DACFP course master videos. Synthetic data
   only. Email sending is stubbed to console/log — no live email provider.
3. **All data access goes through the provider interface** (`src/data/
   provider.ts`). Components never import a Supabase client directly. Two
   implementations: `mockProvider` (in-memory, D0) and `supabaseProvider`
   (D1+). The interface shape mirrors the schema in §2 exactly; if the
   schema changes, the interface changes in the same commit.
4. **Quiz answer keys never reach the client.** The `correct` column has no
   learner-readable path: no RLS grant, no view, no API response, no
   client-side grading fallback. Every session that touches quiz code
   re-verifies this and pastes proof (response-body inspection) at the gate.
5. **Progression state is derived, never stored.** Module unlocks, course
   unlocks, and quiz attemptability are computed from enrollments,
   attempts, progress, and completion events at read time. No
   `is_unlocked` columns, no mutable progression flags, anywhere.
6. **RLS on every table from the migration that creates it.** No
   "add policies later." Learner scope = own rows only via auth.uid();
   content readable only under an active, unexpired enrollment; service
   role for admin/worker paths. `security_invoker=on` on every view, and
   re-applied after any CREATE OR REPLACE VIEW (replacement silently drops
   it).
7. **Emails are LOWER()-normalized** at write time and LOWER() on both
   sides of every join.
8. **verify_jwt=true on every edge function** in this repo. There are no
   external webhooks in the dark build; nothing qualifies for the
   exception.
9. **One session, one branch, one merge gate.** Each session ends with:
   what changed, gate evidence pasted (SQL output, RLS negative tests,
   response bodies as required by the phase), and stops. Merge happens only
   on Jack's explicit "merge approved." Self-reports are not verification.
10. **No scope creep.** Money-path integration, Absorb migration, Credly,
    CE reporting workflows, sponsor portals, white-label branding,
    enterprise seats, and SSO are LATER specs. The only hooks this build
    ships for them are §6's interfaces. Do not build ahead.
11. **Tailored, not generic.** This LMS serves one organization's known
    catalog. When a design choice is between "configurable for arbitrary
    future cases" and "simple for the catalog in §1," choose simple.
12. **The exam policy is a published marketing promise, not a config.**
    "10-question quiz at the end of each module; 70% or higher to move on;
    no cumulative exam; unlimited attempts." Any code that would make the
    shipped behavior deviate from this is a STOP-and-flag, not a judgment
    call.

## 1. WHAT THIS IS

A self-hosted LMS for DACFP's CBDA program. The real catalog:

- **FPT (main course, "Certified in Blockchain and Digital Assets |
  Financial Professional Track"):** 14 sequential modules (Bitcoin;
  Blockchain/DLT; Intro to Digital Assets & Currencies; Layer 2/Tokens/
  DeFi; Real-World Use Cases; Investment Thesis; Investment Opportunities;
  Portfolio Construction; Regulation; Operations/Compliance/Risk;
  Taxation; Explaining Crypto to Clients; Custody & Security;
  Incorporating Crypto into Your Practice). Each module ends in a
  10-question quiz per Hard Rule 12. Completion fires the course
  completion event. Video is compliance-style: no seeking past the
  furthest point watched. Course carries CE credits (up to 18
  CFP/IWI/CFA across the program).
- **Bonus modules (6):** one `open`-progression course, UNLOCKED only
  after FPT completion (publicly marketed as "once enrolled and
  completed"). No sequential gating; quizzes optional; additional CE
  credits; completion carries no downstream consequence.
- **Renewal courses:** NEW content each year, one new course per year
  (e.g. "Renewal 2026"): ~1 hour, 1 module, 1 CE credit, 1 quiz.
  Completion fires a completion event consumed later for renewal
  designation issuance. One enrollment per (person, course) holds
  everywhere because each year is a distinct course.

Ease of authoring is first-class (§7): a new renewal course is created
annually and must be a ≤30-minute job.

Stack: Vite + React 19 + Tailwind v4, Supabase (Postgres + Auth + Edge
Functions), Vercel. Placeholder video via a stub signed-URL flow (§4) —
Cloudflare Stream integration is deferred; interfaces are shaped for it.

## 2. DATA MODEL (single migration set, created in D2)

    lms_courses          id uuid pk default gen_random_uuid(), slug text
                         unique, title text, description text,
                         status text check (status in
                           ('draft','published','archived'))
                           default 'draft',
                         progression text check (progression in
                           ('sequential','open')) default 'sequential',
                         prerequisite_course_id uuid null
                           references lms_courses(id),
                         ce_credits numeric null,   -- credits the course
                                                    -- carries (display +
                                                    -- future reporting)
                         requires_terms_acceptance bool default false,
                         created_at timestamptz default now()
    lms_modules          id, course_id fk, position int, title text,
                         ce_credits numeric null,   -- optional per-module
                         unique (course_id, position)
    lms_lessons          id, module_id fk, position int, title text,
                         kind text check (kind in ('video','reading')),
                         video_ref text,            -- provider-agnostic;
                                                    -- Stream UID later,
                                                    -- placeholder now
                         duration_seconds int, body_md text,
                         is_required bool default true,
                         unique (module_id, position)
    lms_lesson_resources id, lesson_id fk, position int, title text,
                         file_ref text              -- downloadable
                                                    -- handouts/slides;
                                                    -- placeholder files in
                                                    -- dark build
    lms_module_quizzes   id, module_id fk unique,   -- 0 or 1 per module;
                         question_count int default 10,   -- optional for
                         pass_pct int default 70          -- open courses
    lms_quiz_questions   id, quiz_id fk, position int, prompt text,
                         choices jsonb,             -- [{id, text}]
                         correct jsonb,             -- [choice ids]
                         points int default 1
    lms_learner_profiles auth_user_id uuid pk, display_name text,
                         credential_ids jsonb default '{}',
                            -- optional {cfp, iwi, cfa} IDs, learner-
                            -- entered; consumed by future CE reporting
                         created_at, updated_at
    lms_enrollments      id, person_email text, auth_user_id uuid null,
                         course_id fk, source text check (source in
                         ('fpt_purchase','renewal','enterprise_seat',
                          'manual','absorb_migrated','synthetic')),
                         enrolled_at timestamptz, expires_at timestamptz,
                         status text check (status in
                         ('active','expired','revoked')),
                         terms_accepted_at timestamptz null,
                         order_id uuid null,
                         unique (person_email, course_id)
    lms_lesson_progress  id, enrollment_id fk, lesson_id fk,
                         started_at, completed_at,
                         last_position_seconds int,   -- resume point
                         max_watched_seconds int,     -- furthest ever
                                                      -- watched; seek gate
                         updated_at,
                         unique (enrollment_id, lesson_id)
    lms_quiz_attempts    id, enrollment_id fk, quiz_id fk,
                         attempt_number int, started_at, submitted_at,
                         answers jsonb, score int, passed bool,
                         unique (enrollment_id, quiz_id, attempt_number)
    lms_completion_events id, enrollment_id fk unique, completed_at,
                         trigger text check (trigger in
                         ('all_requirements_met','manual_admin')),
                         processed_at timestamptz null,
                         designation_issued bool default false

Notes: `source='synthetic'` keeps dark-build rows distinguishable and bulk-
deletable. `prerequisite_course_id` implements the bonus-after-FPT gate
generically (one nullable FK, not a rules engine — Hard Rule 11).
`ce_credits` and `credential_ids` are MODELING + COLLECTION only — no CE
reporting workflow exists in this repo (Hard Rule 10). `lms_completion_
events` is append-only and is the ONLY completion signal any external
system will ever consume.

## 3. PROGRESSION ENGINE (pure functions, unit-tested, no DB required)

Implemented in `src/engine/` as pure functions over plain data so they run
identically against the mock provider (D0) and live rows (D4+):

- `courseUnlocked(course, completions)`: true iff
  prerequisite_course_id is null OR that course has a completion event for
  this person. Gates entry, not enrollment existence (the bonus enrollment
  may be granted at FPT purchase; it stays locked until FPT completes).
- `moduleUnlocked(course, n, attempts)`: for `open` courses, always true.
  For `sequential`: true iff n === 1 or module n-1's quiz has a passed
  attempt (a module with no quiz counts as passed when all its required
  lessons are complete).
- `quizAttemptable(module, progress, attempts)`: module unlocked AND every
  required lesson in that module completed. Attempts unlimited; no
  cooldown (Hard Rule 12).
- **Video completion (compliance rule):** a video lesson's completed_at is
  set only when max_watched_seconds ≥ 95% of duration_seconds. Rewind and
  rewatch are always free; forward seeking is clamped to
  max_watched_seconds (§4). Readings: explicit mark-complete.
- `courseComplete(course, progress, attempts)`: every required lesson
  complete AND every module quiz (where one exists) passed. No cumulative
  exam exists or may be added (Hard Rule 12).
- Grading (server-side only, D4): score = sum of points where the answer
  set matches `correct`; passed = score/total ≥ pass_pct. Question order
  and choice order shuffled per attempt at display time; grading maps by
  stable choice ids.
- Completion detector (D4): evaluated after any passing attempt or lesson
  completion; first true → insert lms_completion_events with ON CONFLICT
  DO NOTHING (idempotent via unique enrollment_id).
- Terms gate: if course.requires_terms_acceptance and
  enrollment.terms_accepted_at is null, course content is not accessible
  until the learner accepts (one-time modal, stamps the timestamp).

## 4. VIDEO (placeholder now, Stream-shaped, compliance player)

- Edge function `lms-playback-token`: checks caller has an active,
  unexpired enrollment covering the lesson AND the lesson's course/module
  is unlocked AND terms gate satisfied → returns `{url, expires_at,
  max_watched_seconds}`. Dark build: signs a short-lived token over a
  placeholder asset. The response contract is final; only the signing
  backend changes when Stream lands.
- **Player seek policy:** seeking backward always allowed; seeking forward
  clamped to max_watched_seconds. Playback-rate fixed at 1x for required
  FPT/renewal videos; `open`-progression courses allow free seeking and
  speed.
- Heartbeat every 15s and on pause/end → upsert lms_lesson_progress:
  last_position_seconds (resume) and max_watched_seconds
  (monotonic — never decreases).
- **Server-side plausibility check (lightweight, not DRM):** the heartbeat
  endpoint rejects max_watched_seconds growth exceeding ~1.5× wall-clock
  elapsed since the previous heartbeat for that lesson. Stops trivial
  spoofing; deliberately nothing fancier (Hard Rule 11).

## 5. LEARNER APP (pages, D0 shell → D5 complete)

- `/login`, `/reset` — password + email-OTP reset. Generic auth errors
  (no account enumeration).
- `/dashboard` — one card per enrollment: FPT (% complete, module states,
  resume), bonus course (locked with "complete FPT to unlock" until
  courseUnlocked, then open), current renewal course when enrolled.
  CE credits shown on course cards. Access expiry shown plainly. Copy
  preserves the access-vs-designation separation (course access expires;
  the designation is governed elsewhere).
- `/course/:slug/module/:n` — lesson list with completion ticks,
  downloadable resources where present, quiz entry enabled only when
  attemptable, clear locked-state messaging.
- `/lesson/:id` — player (seek policy per §4) / reading view, resources
  list, prev-next within module.
- `/quiz/:moduleId` — attempt flow, immediate result, score, retake
  (unlimited), on pass: next module unlocked.
- `/account` — name, email, password, and OPTIONAL credential IDs
  (CFP ID, IWI ID, CFA ID) with copy explaining they're used for CE
  credit reporting. Stored in lms_learner_profiles.credential_ids.
- First-entry terms modal where the course requires it (§3 terms gate).
- Mobile-first. Design tokens start from the DACFP command-center theme;
  a dedicated visual pass is a separate later workstream — build clean,
  not final.

## 6. INTERFACES FOR LATER SYSTEMS (build the socket, not the plug)

- **IN:** service-role RPC `lms_grant_enrollment(p_email, p_course_slug,
  p_source, p_expires_at, p_order_id)` — the single entry point anything
  (future provisioner, renewals, enterprise seats, migration) will call.
  Creates auth user if absent (no password; claim flow later), upserts the
  enrollment. FPT purchase grants BOTH fpt and bonus enrollments (bonus
  stays locked by the prerequisite gate until earned). Dark build:
  exercised only by seed scripts.
- **OUT:** `lms_completion_events` where processed_at IS NULL is the queue
  a future worker consumes (FPT completion → designation issuance;
  renewal-course completion → renewal designation path). This repo never
  processes it.
- **OUT:** view `v_lms_person_progress` (security_invoker=on): one row per
  person_email per course — status, % complete, last activity, ce_credits
  of the course, and credential_ids (join through profiles) so a future CE
  reporting workflow reads one object. Consumed by nothing in this repo.

## 7. ADMIN (D6, operator-role only) — authoring ease is the requirement

Internal surface behind `app_metadata.role='operator'`:
- Course/module/lesson CRUD with drag-reorder; **"new renewal course"
  must be a ≤30-minute authoring job**: create course → add module(s) →
  attach videos → import question bank → set ce_credits → publish. Treat
  that as D6's acceptance scenario.
- Question-bank import (JSON/CSV), video_ref assignment, lesson resource
  upload, publish toggle, per-course settings (progression, prerequisite,
  pass_pct, ce_credits, terms requirement).
- Per-learner inspector (enrollments, progress, attempts, profile).
- Two audited actions writing to `lms_admin_actions`: reset-attempt-
  history, manual-mark-complete. Logged, role-gated.

## 8. SYNTHETIC CONTENT + SEEDS

Seed script creates:
- Course "FPT Sandbox" (sequential, ce_credits set, terms required):
  4 modules × 3 lessons (placeholder videos + one reading + one lesson
  with a placeholder resource file), 4 quizzes × 10 real-shaped
  placeholder questions. (Real FPT is 14 modules; 4 is sufficient to
  exercise every mechanic — real structure arrives with real content in
  the later migration spec.)
- Course "Bonus Sandbox" (open, prerequisite = FPT Sandbox, ce_credits
  set): 3 modules, no quizzes.
- Course "Renewal 2026 Sandbox" (sequential, ce_credits = 1): 1 module,
  1 quiz.
- 6 synthetic learners at staged states: fresh (terms not yet accepted);
  mid-module-2; quiz-failed-on-3; one-quiz-from-done; FPT-completed
  (bonus unlocked, renewal enrolled); fully complete including renewal.
  At least one profile with credential_ids populated.
All enrollments source='synthetic'. Blocklist patterns from production
(%@example.%, test@%) are the ONLY email shapes allowed here — inverted on
purpose so sandbox data could never be mistaken for real members.

## 9. PHASES (one Codex session each; gate evidence required to merge)

- **D0 — Scaffold + mock.** Vite/React19/Tailwind4 app, routing shell for
  all §5 pages, provider interface + mockProvider with the §8 synthetic
  states, engine functions with unit tests. Tests must cover: module 1
  always unlocked; module N locked until N-1 passed; module-without-quiz
  passes on lesson completion; open-course modules never locked;
  prerequisite gate (bonus locked until FPT completion event); terms gate
  blocks content until accepted; quiz not attemptable with an incomplete
  required lesson; unlimited attempts; 70% boundary (7/10 passes, 6/10
  fails); video completion at max_watched ≥95%; course completion
  requires all required lessons + all existing quizzes and involves no
  cumulative exam. Vercel deploy. GATE: preview URL walks all pages on
  mock data; engine tests green; zero Supabase imports outside the
  (empty) supabaseProvider stub.
- **D1 — Sandbox auth.** Wire supabaseProvider auth: signup/login/reset,
  role stamping (learner via trigger on signup; operator seeded), leaked-
  password protection ON, protected routes. GATE: RLS negative tests
  pasted (learner A ≠ learner B; anon reads nothing); auth error bodies
  generic.
- **D2 — Schema + seed.** §2 migration set, RLS policies, §6 RPC + view,
  seed script, mock→supabase provider swap for content reads. GATE: SQL
  count verification of seeded structure; `correct`-column grant audit
  pasted; security_invoker verified via pg_class/pg_options_to_table
  (information_schema does not expose it).
- **D3 — Video placeholder.** lms-playback-token (incl. unlock + terms
  checks), player with seek clamp + fixed rate, heartbeat with
  max_watched + plausibility check, resume, 95% completion rule. GATE:
  synthetic learner watches end-to-end; token expiry proven; asset
  unreachable without token; forward-seek clamp demonstrated; spoofed
  heartbeat (implausible jump) rejected.
- **D4 — Quizzes + progression live.** lms-get-quiz (strips correct),
  lms-grade-attempt, unlock derivation against live rows (module,
  course-prerequisite, terms), completion detector + event insert. GATE:
  wet-run pass/fail/retake/unlock sequence including bonus unlock on FPT
  completion; response-body proof no payload contains correct;
  duplicate-completion idempotency test.
- **D5 — Learner UI complete.** All pages to spec, states (incl. locked
  bonus card, terms modal, resources, credential IDs on account), empty
  states, mobile pass, copy. GATE: full visual QA on preview; Jack
  start-to-finish walkthrough as a synthetic learner including a
  deliberate quiz fail and the bonus unlock moment.
- **D6 — Admin.** §7 surface + audited actions. GATE: the "new renewal
  course in ≤30 minutes" authoring scenario performed end-to-end
  including ce_credits and a resource upload; actions logged and
  role-gated (negative test as learner); question import round-trip.

End state: full walkthrough with real auth, real database, placeholder
video, zero production footprint. Promotion to production is a LATER spec:
same migrations, new env, real content (14 FPT modules), and the
integration phases — none of which happen in this repo without a new
standing spec.
