# DACFP-LMS — SURVEY BRANCHING SPEC (V1b) — routed sections (flow model)

STATUS: Commit as V1B-SPEC.md (supersedes any prior V1b draft). Runs
AFTER V1 merges. Behavior-change session. Structure references:
docs/cbda-survey-question-structure.md (extracted question content)
and the Absorb flow graph (Jack's capture, below) — the REAL
pre-course survey is a branching flow with second-level splits and
converging paths; the model below represents it exactly.

## 1. DATA MODEL (migration)
- lms_survey_sections: id, lesson_id fk (kind='survey'), position,
  title text null (internal label; not necessarily shown). A survey
  lesson's questions now belong to sections:
  lms_survey_questions gains section_id fk (backfill V1's flat
  questions into a single default section per lesson).
- ROUTING: lms_survey_sections gains default_next_section_id uuid
  null (null = submit/end). A question may be a GATE:
  lms_survey_questions gains routes jsonb null — mapping choice_id →
  next_section_id, valid only on single_choice questions and only
  overriding the section's default when the answered choice has a
  route. Constraint: routes' targets belong to the same lesson;
  cycles rejected at write time (admin function validates
  reachability + acyclicity).
- Option-level free text: choice objects gain optional
  "allow_free_text": true (an "Other (specify)" slot on the option —
  never a standalone question).
- lms_survey_responses.answers extended per V1 shape plus
  choice_free_text and a recorded "path": ordered section ids
  traversed (so read-back and reporting know exactly what was
  shown).
- One immutable response per enrollment stands (Absorb retakes were
  an artifact; annual re-enrollment provides longitudinal history).

## 2. COMPLETION SEMANTICS (tested)
- Submission validity = every required question in every TRAVERSED
  section answered. Untraversed sections impose nothing.
- Changing a gate answer before submit re-routes; answers in
  sections no longer on the path are discarded at submit (recorded
  path is authoritative).
- Engine surface unchanged from V1 (survey lessonComplete = response
  exists); all routing logic lives in the survey layer, not
  progression.ts. Engine-copy identity test must still pass.

## 3. LEARNER UI
- Sections render one at a time (natural fit with routing); Continue
  advances along default or routed edge; Back allowed pre-submit;
  option free-text input appears when its choice selects; submitted
  view shows the traversed path only.

## 4. ADMIN
- Section CRUD + reorder within a survey lesson; gate editor: pick a
  single_choice question, map choices → sections; validator refuses
  cycles/unreachable-required paths and shows a simple text outline
  of the flow ("§1 → gate Q8: Yes→§2, No→§3, Other→§4; §2→§5 …") —
  an outline, not a graph canvas (Hard Rule 11).
- RESULTS: per-question denominators = respondents whose PATH
  included that section; free text listed under its option; path
  distribution summary (counts per traversed route).
- Bulk CSV: unversed sections blank; path column included.

## 5. GATE (V1b)
Migration SQL; backfill proof (V1's flat surveys still render and
submit); wet run staging a miniature of the real flow — spine →
three-way gate → one branch containing a second-level gate →
convergence to a shared tail — on a synthetic learner covering two
different paths (two enrollments or reseeded): traversed-only
requirements enforced, re-route discards correctly, path recorded;
admin outline validator output; branch-aware results + path
distribution; CSV with path column; cycle rejection negative test;
suite green; branch + hash.
