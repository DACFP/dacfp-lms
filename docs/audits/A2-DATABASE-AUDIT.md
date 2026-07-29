# LEG A2 — DATABASE AUDIT (sandbox xfvaohvismisfdggfdfj)
Auditor: Claude (direct connector). Executed 2026-07-28, post-F4;
F3–F6 fixes verified live in the same passes. VERDICT: PASS, no
findings.

## Census results (verified from pg_catalog, not assumptions)
- RLS: every lms_* table RLS-ENABLED and FORCED (anomaly query over
  pg_class returned empty).
- Grants: zero anon grants on any lms table; zero table-level
  learner (authenticated) INSERT/UPDATE/DELETE — learner writes are
  column-scoped (profiles) or via functions only; survey-response
  INSERT revoked (F3), immutability by grant omission.
- SECURITY DEFINER inventory: every definer in public/lms_private
  carries a pinned search_path (zero without).
- Event triggers: exactly 6, all Supabase platform
  (issue_graphql_placeholder, pgrst_ddl_watch, pgrst_drop_watch,
  issue_pg_cron_access, issue_pg_net_access,
  issue_pg_graphql_access). The rls_auto_enable class remains
  extinct.
- Migration ledger: 18 migrations, reconciled with the repo tree;
  lineage through f6_closeout verified.
- Storage: lms-video and lms-resources both private.
- Data hygiene: zero non-synthetic auth users (all %@example.test +
  jack@thetayf.com).
- Drift: zero non-lms tables in public.

## Advisor flags — all documented-intentional
- 3 INFO: service-role-only tables correctly have no policies
  (lms_admin_actions, lms_ce_report_runs class).
- 2 WARN: deliberately learner-callable definers — lms_accept_terms
  (F1 design), lms_ce_reporting_status (R1 learner panel). F5 added
  lms_enrollment_course_summaries (reviewed line-by-line: empty
  pinned search_path, auth.uid()-scoped to caller's own EXPIRED
  enrollments, identity columns only, revoked from public/anon).
- Leaked-password protection: known promotion-day toggle.

## Fix verifications folded into A2 (live)
F3: all three auth.users triggers WHEN-scoped to lms_provisioned;
operator check reads lms_role; 2 sandbox operators migrated; 14
profile CHECKs; updated_at unwritable; preview RPC service-role
only; assertion fn present. F4: audited reads in ledger (all four
actions), orphan-protection signature + audit row, program IDs on
all seven courses, middle_name column, ce_report_runs RLS forced
with zero learner grants, frozen run row + audit. F6: f6_closeout
in ledger, scratch course deleted (3 delete_course audit rows),
fresh's routed survey response + intro completion present.
