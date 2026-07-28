# DACFP-LMS — F6: A4 RE-RUN CLOSEOUT (final fix batch)

STATUS: Commit as F6-SPEC.md. One gated Codex session, branch
codex/f6-closeout. SPEC.md v3.2 Hard Rules govern. A4-RR ledger IDs
authoritative. Gate artifacts never contain the production ref
literal. State-museum fixture contract stands.

## 1. A4-RR-001 — routed survey client failure (THE blocker)
Selecting any choice in the routed pre-course survey replaces the
form with "Survey sections are unavailable"; reload restores;
reproducible. Diagnose in the browser first (the state transition on
choice-select is destroying/refetching section state), fix the
routed-survey component's state handling, and prove the FULL fresh
survey journey wet: rating → gate choice → routed section → submit →
lesson complete → next blocker advances. Root-cause narrative
required in evidence (this defect survived two audits — the fix must
name why).

## 2. A4-RR-002 — expired deep routes
Every lesson/module/quiz route for an expired enrollment renders the
designed expired panel (F5 §1b), never "Lesson not found". The
not-found branch may only render when the resource truly does not
exist for an ACTIVE entitlement. Wet: midmodule deep lesson URL +
one quiz URL both show the expired panel.

## 3. A4-RR-003 — retained CE export re-download
Run history "Download again" regenerates the workbook from the
frozen rows and downloads it. Wet: download the existing retained
run; file opens with the template header.

## 4. A4-RR-004 — course deletion
Admin course editor gains Delete course: destructive confirm names
the course; refuses when ANY enrollment exists (support card copy);
cascades modules/lessons/quizzes/surveys via the existing renumber-
safe paths; audited. Wet: delete the residual audit-scratch-a4-rerun
draft (this doubles as the cleanup).

## 5. QA-DEF-006 — destructive control naming
Every quiz-reset control and its confirmation names its module and
quiz ("Reset Module 3 quiz attempts for <learner>"); accessible
names unique.

## 6. QA-DEF-011 + QA-DEF-005 — admin pending + inspector detail
Pending labels/disablement + repeat-submit protection on Add module,
Add lesson, Save lesson, Save survey flow, Inspect learner (the F2
lifecycle pattern, applied); explicit empty-curriculum state on a
new course; stale search results cleared on new lookup. Inspector
lesson progress becomes per-lesson rows (lesson title, completed_at
or resume position, updated_at) behind a collapsible.

## 7. COPY/FRICTION SWEEP (each one line in evidence)
a. Optional lessons excluded from module checklist denominators
   ("3/3 complete · 1 optional"); b. lesson ordering consistent
   everywhere (position sort — fix the module-overview comparator);
c. review-mode entitlement resolved before first paint (no 1× flash
   — hold player chrome until token returns); d. module counter
   consistent ("Module 4 of 5" everywhere — one source, no
   zero-padding drift, Introduction counted); e. survey gate copy
   contextual: on quiz-less modules say "Required to finish the
   course" only; f. resume-memory cue: verify it renders when
   last_position_seconds > 0 (add a unit test with a mid-lesson
   fixture state — do NOT stage live actors).

## 8. GATE (F6)
Numbered wet evidence per section (§1 full journey, §2 both routes,
§3 download, §4 delete incl. refusal-with-enrollment proof on a
synthetic, §5 names, §6 pending + inspector rows, §7 line each);
root-cause narrative for §1; suite green with justified changes;
branch + hash.
