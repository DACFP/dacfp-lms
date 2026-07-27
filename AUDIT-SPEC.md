# DACFP-LMS — PRODUCTION-READINESS AUDIT (A-SERIES) — full charter

STATUS: Commit as AUDIT-SPEC.md. Runs after R1 merges. This is the
structural sign-off: the build is the production architecture; the
audit certifies it (or produces the fix list that gets it there).
Three legs, three auditors, one verdict document.

## LEG A1 — ADVERSARIAL CODEBASE AUDIT (Fable, Claude Code, READ-ONLY)
Charter: assume the code is guilty. Full-tree pass at current main —
not incremental; the prior audit (commit 84e37e4) predates the
majority of the codebase.

Scope, in priority order:
1. SECURITY: answer-key isolation end to end (Hard Rule 4) including
   every path added since D4; survey subsystem (learner-writable
   jsonb answers/choice_free_text — injection, size, shape abuse;
   routing manipulation; response immutability); two-mode player
   server trust (review-mode derivation, plausibility, token
   lifecycle); profile expansion input surface (address jsonb, urls,
   phone); admin RPC family (operator gating, validation, audit
   atomicity); edge functions (authn/z, CORS posture, error
   leakage, unguarded parses); RLS assumptions embedded in client
   code; secrets discipline.
2. CORRECTNESS: progression + routing engines vs SPEC v3.2 (fresh
   derivation, not diff); grading; completion detection everywhere
   it must fire; the F-series remediations verified still intact
   (regression archaeology: H-1, H-8, M-2..M-5, M-9); date/timezone
   handling (expiry, anniversaries); concurrency (double-submit,
   parallel heartbeats, idempotency).
3. CODE QUALITY / SLOP: dead code, duplicated logic outside the
   sanctioned copy pattern, inconsistent patterns across the 13
   sessions' accretion, TODO/placeholder leakage, error-handling
   uniformity (the F2 mutation-status pattern adopted everywhere or
   drifted?), type honesty (any `any`, unsafe casts), component
   hygiene, test quality (assert behavior vs implementation,
   coverage of the money paths: grading, completion, entitlement).
4. PERFORMANCE: bundle composition (the standing >500kB advisory —
   name the causes), query patterns (N+1s in providers/functions),
   render hotspots, the timeout-hungry admin tests as a smell.
5. ACCESSIBILITY: the O1 infrastructure (dialogs, announcer, focus)
   still correctly wired after T1/X1/X2 reskins; forms; contrast
   regressions vs TOKENS.md.
6. PRODUCTION-COHABITATION READINESS (new, critical): the promotion
   model is fresh migrations into the PRODUCTION project shared with
   the command center. Audit as if performing that merge: namespace
   collision census (tables, functions, triggers, policies, indexes,
   storage buckets, edge-function names vs the cbda_* estate);
   shared auth.users implications (the LMS creates users; the
   command center has 5 admin accounts and its own role model —
   collision of metadata conventions? trigger interference?);
   migration re-runnability on an empty-of-lms prod (ordering,
   IF EXISTS discipline, seed separation — seed must NEVER run in
   prod); anything hardcoding sandbox refs/URLs; env-var inventory
   (what promotion must provide).
Output: severity-ranked findings (Critical/High/Medium/Low/Note),
each with file:line, exploit-or-failure narrative, and a directed
fix. Plus a PRODUCTION-BLOCKERS list: the subset that must close
before promotion, distinguished from should-fix and cosmetic.
Format: brief-input style for direct conversion to fix-session specs.
Constraint: READ-ONLY — no edits, no Supabase calls, attestation
[SUPABASE: NONE | calls: 0] every turn. Gate artifacts never contain
the production ref literal.

## LEG A2 — DATABASE AUDIT (Claude, direct via connector)
1. Advisor suites (security + performance), full output.
2. RLS census: every table × role × verb from pg_catalog (not
   assumptions): enabled, FORCED, policy predicates read line by
   line; learner isolation proven by adversarial queries as a
   synthetic user where feasible.
3. Grant archaeology: information_schema sweep for anon/
   authenticated/public grants beyond design; function ACLs
   (EXECUTE census); SECURITY DEFINER inventory with search_path
   verification.
4. Constraint census vs Hard Rules (pass_pct/question_count CHECKs,
   survey shape checks, uniqueness/idempotency keys).
5. Drift reconciliation: live schema vs migration files (the
   rls_auto_enable class); orphaned objects; migration ledger
   integrity.
6. Trigger inventory + event triggers (must be zero non-Supabase).
7. Data hygiene: synthetic-only check (every auth.users +
   person_email matches %@example.% except jack@thetayf.com),
   PII scan of free-text fields.
8. Storage: bucket inventory, public flags, policy posture.

## LEG A3 — REPO HEALTH (Claude, mechanical)
1. Secret scan across FULL history (all objects, all branches) —
   keys, tokens, connection strings; the known finding: the
   production ref exists in pre-redaction history — recorded with a
   disposition decision (acceptable for private repo vs history
   rewrite before the repo→private flip).
2. Branch hygiene: merged-branch archive/delete plan; the
   quarantine branch codex/qa-loop-artifacts gets its overdue
   review HERE — defect ledger read, fixes triaged
   (superseded / re-land / drop).
3. Dependency audit: npm audit, unused deps, license sweep
   (MIT-compatible tree), lockfile integrity.
4. File hygiene: .DS_Store and friends, large files, .gitignore
   completeness, docs/ inventory accuracy.
5. CI-readiness checklist: the workflow the CI session will need
   (vitest with environment-aware timeouts — the known admin-test
   findings; tsc; forbidden-ref grep; secret grep), branch
   protection recommendation for main.

## LEG A4 — BROWSER JOURNEY AUDIT (Codex, live app + sandbox, findings-only)
The sanctioned successor to the quarantined QA loop: authenticated,
in-browser, end-to-end journey testing of the deployed/local app —
UX, behavior, and copy audited as a USER, not as a reader of code.

Actors: the state museum (State-Test!2026): fresh (full first-run
journey end to end incl. intro survey → module 1 → lessons → quiz
fail → guided recovery → retake → pass → bridge), almostdone (final
quiz → completion moment → credential reveal → My Credentials),
near-expiry (renewal card presence + copy), midmodule (expired
experience), fptcomplete (bonus library, review-mode player at 2x,
certificate print view), d6operator (authoring flow end to end,
survey flow editor round trip, CE preview/export, inspector,
one destructive confirm on scratch content only).

Per journey: screenshot each moment; log every defect in
brief-input format (severity, where, what happened, expected,
repro); separately log UX FRICTION notes (works-but-awkward) and
COPY defects. Cross-check the X2 moments and PAIN-POINTS
requirements render as specified.

HARD RULES: zero repo file edits (findings only — fixes go to a
gated session); learner-side data writes are permitted ONLY as the
natural product of synthetic journeys; NO direct SQL, no
service-role usage, no seed changes; admin mutations confined to a
clearly-named scratch course created and deleted within the
session; no account creation; attestation line every turn; gate
artifacts never contain the production ref literal.

## VERDICT DOCUMENT
One page, three signatures' worth of content: per-leg summary,
the PRODUCTION-BLOCKERS list (may be empty), the should-fix backlog
routed into fix-session specs, and the sentence Jack gets to use:
"structurally certified for production promotion, subject to the
blocker list." This document joins docs/ and the Don packet.
