# DACFP-LMS — F3: PRODUCTION-BLOCKER REMEDIATION (from Leg A1)

STATUS: Commit as F3-SPEC.md, with the audit at
docs/audits/A1-AUDIT-REPORT.md (commit together). One gated Codex
session, branch codex/f3-blockers. SPEC.md v3.2 Hard Rules govern.
Fix EXACTLY what is named; A1 finding numbers are the authority for
detail (file:line + directed fixes live there). F4 (should-fix
batch) follows separately — touching F4 scope here is a violation.

## 1. A1-1 — auth.users trigger scoping (THE CRITICAL)
Per the directed fix, all three parts: (a) namespace the claim to
lms_role everywhere (stamp trigger, lms_admin_actor_is_operator,
toRole() in supabaseProvider, operator seeding — migration updates
existing sandbox rows); (b) stamp only when lms_role is absent
(never overwrite); (c) WHEN-scope BOTH auth.users triggers to
LMS-provisioned users only via an explicit marker
(raw_app_meta_data->>'lms_provisioned' = 'true') written by
lms_grant_enrollment and the signup path — command-center inserts
untouched. Negative test: an insert WITHOUT the marker gets no
stamp and no profile row.

## 2. A1-2 — survey response direct-insert (mirror the F1 rider)
revoke insert on lms_survey_responses from authenticated; drop
policy lms_survey_responses_insert_own. Keep select. Negative proof
(42501) in evidence.

## 3. A1-3 — one CE selection implementation
New read-only SQL function lms_admin_preview_ce_report sharing its
candidate SELECT with lms_admin_create_ce_report_run (factor once);
delete the TypeScript reimplementation; run creation takes the
previewed completion_id[] and FAILS LOUDLY if the live set differs;
non-exportable completions emit into an explicit excluded bucket
with reasons (no-profile, no-program-id, non-string-cfp,
blank-name). Preview and export can no longer diverge by
construction. A1-14 rider: map errcode 22023 → 400 InvalidRequest
in lms-admin so empty results stop surfacing as 500s.

## 4. A1-6 — profile validation
One migration: length CHECKs (≤200) on all learner-writable text
columns; pg_column_size caps (address <4096, credential_ids <1024);
credential_ids values all jsonb string ≤64; firm_url ~ '^https?://';
revoke update(updated_at) from authenticated (trigger stamps it).
Export guard: blank first/last name rows land in the excluded
bucket (§3), never in the filing. Client: matching maxLength attrs.

## 5. A1-9 — config.toml completeness
[functions.lms-submit-survey] verify_jwt = true. Plus a repo test
asserting every supabase/functions/* directory has a config block
(the CI assertion, landed now as a vitest).

## 6. A1-11 — CORS allowlist
All seven functions: origin echoed only when present in
LMS_ALLOWED_ORIGINS (comma-separated env; sandbox value set via
secrets); no wildcard remains. Preflight + error paths included.

## 7. A1-35 — CFP program-ID promotion decoupling
Post-migration assertion function lms_assert_ce_reportable() that
raises listing any course expected reportable with null
cfp_program_id; the slug-matching UPDATE documented as
sandbox-content DML; docs/PROMOTION-INPUTS.md started, recording
production slugs + program-ID mapping as an explicit promotion
input.

## 8. A1-36 — seed guard
seed.sql opens with the abort guard (raise exception if any
non-@example.% auth user exists); config.toml gains [db.seed]
enabled = false with a comment; the guard is TESTED in evidence by
demonstrating the exception fires against a simulated non-synthetic
row (in a transaction, rolled back).

## 9. A1-19 rider — consolidate the anon revoke
Single explicit revoke-all-from-anon migration statement for
lms_learner_profiles (net state unchanged; ledger made unambiguous).

## GATE (F3)
Numbered evidence: migration SQL in full; trigger negative tests
(unmarked insert → no stamp/no profile; marked insert → lms_role
stamped, existing lms_role never overwritten); 42501 on survey
direct-insert; CE preview/export binding proof (previewed set ==
frozen set; mutated-between → loud failure; excluded bucket shown
with reasons incl. a blank-name and a numeric-cfp synthetic); CHECK
rejections proven (over-length, oversized jsonb, bad firm_url,
numeric credential value); config test green; CORS proof (allowed
origin echoed, foreign origin refused); assertion function raising
on a null-program-id course; seed guard firing; suite green with
justified changes; branch + hash. Gate artifacts never contain the
production ref literal.
