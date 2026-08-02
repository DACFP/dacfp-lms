# M2-SPEC — QUIZ ANALYTICS + SURVEY RESPONSE BROWSER
(DACFP/dacfp-lms)

STATUS: Commit as M2-SPEC.md at the repo root AFTER M1 merges. Runs
after M1. Governed by SPEC.md v3.2 Hard Rules. Branch:
codex/m2-analytics.

AMENDMENT 1 (2026-08-01): The current-definitions contract below
ratifies the historical-definition behavior for M2 and routes immutable
definition snapshots to a named future session.

## §0 PRINCIPLES
- M2 is READ-ONLY. It adds zero mutation paths. The only writes are
  lms_admin_actions rows auditing exports.
- Populations are contracts (docs/absorb-reporting-lessons.md rule
  5): every analytics figure derives from a named, defined view —
  never an inline keyword filter. Course and cohort membership is
  defined once and shared by every surface that reports it.
- Figure-equals-query parity (M1 §0 rule extended): any number
  shown must equal the row count or aggregate of the defined view
  it cites; drill-downs open exactly that population.
- CURRENT-DEFINITIONS CONTRACT: §1 and §2 score and render stored
  responses against the CURRENT question and survey definitions by
  design. Where lms_admin_actions history shows a definition-
  mutating action postdating any data a surface displays, that
  surface must show an explicit "definitions changed since this
  data was collected" indicator, derived read-only from the audit
  trail. Attempt-time and submission-time definition snapshots are
  ROUTED OUT as a named future write-path session (definition
  snapshot rider) and are out of scope here.
- Exam law (Hard Rule 12) is untouchable. Analytics observe quiz
  outcomes; nothing here can alter quiz policy, banks, or attempts.
- Survey responses remain immutable (F3). Browsing and exporting
  never expose an edit path.
- All reads flow through the operator-gated lms-admin edge function
  or service-role views with zero authenticated/anon grants. RLS
  posture untouched.

## §1 QUIZ ANALYTICS (nav: under the existing admin area)
- Per-course, per-module rollups: attempts, unique learners
  attempting, pass rate, average attempts-to-pass, retake volume.
- Per-question table (the payoff surface): for each question in a
  module's bank — attempt count, miss rate, and the answer-choice
  distribution. Sortable by miss rate so the worst-worded questions
  surface first. Question prompt and choices display as the bank
  holds them (operators already manage banks; this exposes nothing
  new), but correct-answer flags appear only in this admin surface,
  never in any export produced by §1.
- Aggregate-only: no learner-identifying drill here. Per-learner
  quiz history already lives on the M1 learner file; this surface
  answers "which questions are broken," not "who missed them."
- Empty and low-volume states are explicit: below a named minimum
  attempt count, figures render as "insufficient data," never as
  misleading percentages (lessons rule 3: surface unknown states).

## §2 SURVEY RESPONSE BROWSER
- Per-course, per-survey response list: learner email, submitted
  date, completion context; server-side pagination; date-range and
  course filters.
- Individual response view: the full routed-path response as
  submitted — every question actually presented (in routed order)
  with the learner's answer, including free-text answers verbatim.
- CSV EXPORT: current filtered set, one row per response, columns
  for learner identity and each answer; free text included. Export
  is an audited read naming the filter. This is the surface that
  produces the warm-leads extract (post-course "would introduce to
  employer" class answers) on demand.
- Responses render read-only everywhere; no annotation, no status
  fields, no mutation affordance.

## §3 NAVIGATION AND DASHBOARD TIE-IN
- Both surfaces reachable from the existing admin nav. The M1
  dashboard MAY gain at most one link-tile per surface (recent
  survey responses count, e.g.) governed by the same tile-equals-
  filter rule; no new computed metrics beyond §1/§2 definitions.

## §4 OUT OF SCOPE (recorded dispositions)
- Any write path beyond export audit rows.
- Question bank editing (exists in the admin editor), quiz policy,
  attempt mutation.
- Pushing survey or analytics data to HubSpot or any external
  system (H0/W1 territory).
- Learner-identifying quiz drill-downs (M1 learner file owns
  per-learner history).
- Cross-course cohort comparisons and time-series charts (future,
  when real volume exists; views defined here must not preclude
  them).
- Fixture actors are CONTRACT state: wet proofs read existing
  fixture data without mutation and use SCRATCH learners (created
  and deleted via M1 §4 actions) wherever additional attempt or
  survey volume is needed.

## §5 GATE EVIDENCE (numbered)
1. Population views: each named view's definition shown; at least
   two figures proven equal to their view's direct SQL aggregate.
2. Per-question analytics on a museum-visible bank: miss rates and
   choice distributions match direct SQL (cited); sort by miss rate
   shown; correct-answer flags visible in UI.
3. Insufficient-data state shown below the named minimum attempt
   count.
4. Survey browser: filtered, paginated list matching direct SQL;
   an individual routed response rendered in presented order and
   matching its stored response row (cited) — the F6-era real
   routed submission is acceptable read-only evidence.
5. CSV export of a filtered survey set: file contents match the
   on-screen set; the audited read row cited; §1 exports shown to
   exclude correct-answer flags.
6. Read-only proof: zero new mutation RPCs in the diff; zero new
   authenticated/anon grants; any new views/functions service-role
   scoped with pinned search_path (SQL cite).
7. Fixture integrity: all seven actors plus operators byte-
   identical on profile and enrollment state pre/post session (SQL
   cite); scratch learners fully cleaned up.
8. Suite green; lint, build, forbidden-ref scan clean; branch and
   commit hash.
