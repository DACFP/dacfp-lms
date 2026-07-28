# DACFP-LMS — F7: A5 SWEEP CLOSEOUT + PERFORMANCE

STATUS: Commit as F7-SPEC.md with docs/audits/A5-BROWSER-AUDIT.md
(the sweep report — commit together). One gated Codex session,
branch codex/f7-sweep. SPEC.md v3.2 Hard Rules govern; DEF ids from
the A5 report are authoritative. Fixture contract stands. Gate
artifacts never contain the production ref literal.

## 1. DEF-011 — sign-out clears authentication inputs
Sign-out resets the login form state (email + password empty) and
the inputs carry autocomplete="off"-appropriate attributes for a
shared-machine posture. Wet: sign out → fields empty.

## 2. DEF-009 — bridge copy persistence
Module save round-trips bridge_copy (diagnose: payload omission vs
read-back mapping). Wet: save copy on a scratch module → reload →
value present; confirm on FPT Introduction read-only (no live save).

## 3. DEF-005 — question-bank import
Reproduce with the auditor's canonical shape; fix the validator if
it wrongly rejects, AND make every rejection name the exact
violation (field, question position, reason) — "failed" with no
reason is itself the defect. Wet: canonical 10-question import
succeeds on a scratch quiz; a deliberately broken bank yields a
named error.

## 4. DEF-002 — reading completion write
Diagnose the failing path (learner reading completion via
lms-progress or its RPC) and fix. Wet: fptcomplete marks the GENIUS
Act reading complete; progress reflects 1/1.

## 5. RIDERS (one commit, cited individually)
DEF-008: unknown /admin/* renders the admin shell's not-found state.
DEF-006: manual-complete controls named per course + learner (reset
pattern applied). DEF-010: reorder up-control disabled on the FIRST
row by order, enabled on all subsequent (position-0 aware).
DEF-003: fresh-dashboard summary derives from actual attempt data
(zero-quiz wording) and lock guidance names the full unlock rule.
DEF-001: optional lessons get optional copy + neutral not-started
state. Reading/survey lesson editors hide video path/duration.
Expired learner nav shows "Access expired <date>" not the email.
FPT catalog description updated from "four-module preview".
Contract disclosure labels Collapse/Expand.

## 6. §8 PERFORMANCE — bundle split
Route-level code splitting (learner app / admin / player+survey
heavy chunks lazy-loaded); the build's chunk-size advisory resolved
or reduced with numbers in evidence (before/after main-chunk size);
no behavior change; loading fallbacks use existing skeleton
patterns.

## 7. GATE (F7)
Numbered wet evidence per section; §3 both proofs; §4 the write
landing in DB (progress row cited); §6 before/after sizes; suite
green with justified changes; SELF-CHECK per standing block;
branch + hash.
