# DACFP-LMS — DESIGN DIRECTION (T-series contract input)

STATUS: Standing addendum. Commit to the repo root as
DESIGN-DIRECTION.md alongside Brand/inspiration/cbda-learner-experience.html
(the mockup of record). SPEC-OVERHAUL.md's §0 FREEZE governs the
T-series exactly as it governed O1–O3. Brand/TOKENS.md remains color
law. Where the mockup and this file disagree, THIS FILE wins — it is
the mockup reconciled with published policy.

## 1. VERDICT
The mockup (Brand/inspiration/) is the adopted layout and voice for
the learner experience — superseding the O2 page compositions. It is
deliberately incomplete: screens it covers are implemented in its
image; screens it omits are designed in its voice using its patterns.

## 2. ADOPTED WHOLESALE
- Typography: NOT adopted. The repo's existing type system (O1
  foundation — current families, scale, and eyebrow treatment) is
  retained unchanged. The mockup contributes LAYOUT, STRUCTURE,
  DENSITY, and VOICE — not fonts. Where the mockup uses serif
  display or mono accents, render the same hierarchy with the
  existing type system's weights and sizes. No font dependencies of
  any kind this session.
- Vocabulary: "Checkpoint" (quiz), "Course of study" (course/module
  index), "Your record" (attempt/progress history), "Enrollment term"
  / "Enrollment remaining" (access window). Apply consistently across
  every page, empty state, and toast.
- Voice: the mockup's register — calm, institutional, de-dramatized.
  "A short check of understanding — not an exam. Retake as many times
  as you need." is the model sentence.
- Faculty layer: per-module instructor cards ("Your instructor") as
  in the mockup. Ships NOW as static presentation content: a single
  frontend map module-position → {name, bio, photo?}. Use real DACFP
  faculty content if present under Brand/faculty/; otherwise render
  the section with tasteful "Faculty" placeholders clearly marked
  sandbox. No schema changes (freeze); the data-model home is a
  promotion-era migration.
- Certification-benefits panel ("Upon certification") on the course
  page, per mockup.

## 3. RECONCILIATIONS (mockup text that yields to law — layout stays)
R1. Progression copy: the mockup says "any order" / "Sequential order
    recommended." REALITY: FPT and renewal are mandatory-sequential
    (published mechanics; engine-enforced). Keep the mockup's module
    index layout; copy becomes truthful: modules unlock in order;
    passed/current/locked states per the real derivation. Bonus
    course MAY use the mockup's any-order presentation — it is
    genuinely open progression.
R2. Checkpoint availability: mockup says "available now, or after the
    video — your choice." REALITY: a checkpoint opens when the
    module's required lessons are complete. Keep the card; copy
    states the true condition ("Opens when this module's lessons are
    complete").
R3. Exam-policy sentence: the load-bearing wording — 10 questions,
    70% or higher to pass, unlimited attempts, no final exam —
    appears verbatim in the checkpoint intro area the mockup already
    provides. "Checkpoint" branding and the policy sentence coexist.
R4. Credential copy: mockup says "Digital badge via Credly."
    Becomes provider-neutral: "Your digital credential, shareable to
    LinkedIn." No vendor named in learner-facing copy.
R5. All other load-bearing copy survives verbatim per the freeze:
    access-vs-designation separation sentence, generic denial
    messages.

## 4. SCREENS
Covered by mockup (implement in its image): dashboard, course/module
index ("Course of study"), module detail w/ instructor + "In this
module", checkpoint intro/flow/result ("Your record" history),
certification panel.
Omitted (design in its voice, reusing its patterns): login/reset,
account/profile+credentials, lesson/player page chrome, terms modal,
renewal event surface (keeps O2's visibility-prop contract; restyled
to mockup voice), bonus library section, empty/error/denied states,
admin (admin KEEPS its O3 treatment this pass — learner-only scope).

## 5. NON-NEGOTIABLES CARRIED FORWARD
- §0 FREEZE in full: zero behavior/data-flow/schema/function changes;
  [SUPABASE: NONE | calls: 0] every turn.
- TOKENS.md palette law incl. contrast table; the mockup already
  complies — keep it that way.
- One-question-per-screen checkpoint stepper, StatusAnnouncer verdict,
  select_kind rendering, possible-points denominator — the O2/F2
  mechanics persist under the new skin.
- Mobile-first: every mockup pattern must resolve at 375px; where the
  mockup is desktop-only, the mobile resolution is the implementer's
  design duty in the same voice.
- PAIN-POINTS.md requirements visible in this pass: completion state
  unmissable on dashboard; renewal surface states price/date/cancel
  in body copy; checkpoint copy de-dramatizes retakes.
