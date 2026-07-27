# DACFP-LMS — CE REPORTING SPEC (R1) — CFP Board export

STATUS: Commit to repo root as R1-SPEC.md, with the template at
docs/cfp-ce-template.xlsx. Runs AFTER V1 merges. Behavior-change
session; SPEC.md v3.2 Hard Rules govern.

## 0. AUTHORITATIVE FACTS
- Export format = docs/cfp-ce-template.xlsx, EXACTLY six columns:
  CFP Program ID · Date Individual Completed · Attendee CFP Board ID
  · Attendee Last Name · Attendee First Name · Attendee Middle Name.
- CFP Program IDs (seed into the new column; sandbox courses map to
  the real program they stand in for):
  FPT → 312442; bonus programs: Custody & Security → 332761,
  Spot Ethereum ETFs → 328447, NFTs → 321877, DeFi & DAOs → 321876,
  Staking/Lending/Borrowing → 321875, GENIUS Act → 339638.
  Renewal program ID: PENDING (nullable until provided).
- Reporting obligations the design serves: sponsor reports within
  14 days of completion; records retained 3+ years; middle name may
  be blank.

## 1. DATA MODEL (migration)
- lms_courses.cfp_program_id text null.
- lms_learner_profiles.middle_name text null (export column; optional
  on the Account page beside first/last).
- lms_ce_report_runs: id, created_at, actor_auth_user_id, course_ids
  uuid[], period_start, period_end, row_count int, rows jsonb (the
  exported rows, frozen as-reported — this IS the 3-year record),
  filename text. RLS forced; service-role only; written by lms-admin
  in-transaction with its audit row.
- lms_ce_report_rows-equivalent detail lives in rows jsonb; a
  completion is "reported" when it appears in any run's rows —
  derive, don't duplicate.

## 2. ADMIN — CE REPORTING SURFACE (operator-gated, via lms-admin)
- Screen: pick course(s) + date range (default: since the last run
  covering that course) → PREVIEW: completions in scope split into
  REPORTABLE (has CFP Board ID on profile) and MISSING-ID (listed
  with emails so they can be chased — never silently dropped) and
  ALREADY-REPORTED (appeared in a prior run; excluded by default,
  includable via toggle for corrections).
- EXPORT: generates .xlsx matching the template byte-conventions
  (same sheet name, header row, column order) via SheetJS
  client-side from lms-admin-provided rows; simultaneously records
  the lms_ce_report_runs row server-side (atomic with audit).
  Date format matches the template's expectation.
- RUN HISTORY: list of past runs (when, who, scope, count,
  download-again from frozen rows).
- 14-DAY NUDGE: the reporting screen surfaces a count of
  certifications older than 10 days not yet in any run.

## 3. LEARNER SURFACE (the 585-ticket panel, minimal form)
- On the Account page (not the dashboard — CE tab comes later): a
  small "CE reporting" block visible only post-certification:
  "Reported to CFP Board on <run date>" when their completion
  appears in a run; "Reporting scheduled — DACFP reports within 14
  days of certification" before; "Add your CFP Board ID to be
  included" when ID missing.

## 4. GATE (R1)
Migration SQL; program-ID seeding proof; wet run: stage two
certified synthetics (one with CFP ID, one without) → preview shows
the split → export → paste the generated rows + confirm file opens
matching the template header exactly → run recorded with frozen
rows → re-preview excludes already-reported → learner panel states
verified for both synthetics; audit rows for the export; RLS proofs
on lms_ce_report_runs; suite green; branch + hash.
