# DACFP-LMS — UX SPEC (X1) — behavior-change pass from Jack's walkthrough

STATUS: Commit to repo root as UX-SPEC.md. This is the FIRST sanctioned
behavior-change session since D6: the SPEC-OVERHAUL freeze does NOT
apply. SPEC.md v3.1 Hard Rules 1–12 DO apply (exam policy, answer-key
isolation, RLS, sandbox-only, derived progression). Sandbox Supabase
work (migrations, seed updates, function edits) is permitted and
expected. Brand/TOKENS.md remains color law. Where an item below
conflicts with the T1 mockup or DESIGN-DIRECTION.md, THIS FILE wins.

## 1. VOCABULARY REVERSAL
"Checkpoint" reverts to "Quiz" in ALL learner-facing copy (T1's
rename is reversed by owner decision). Keep the de-dramatized tone
("a short check of understanding") and the verbatim exam-policy
sentence (10 questions, 70% or higher, unlimited attempts, no final
exam). Grep-proof: no learner-facing "checkpoint" strings remain.

## 2. DASHBOARD RESTRUCTURE
2a. FPT is the ONLY course surface pre-completion. Order for a
    mid-course learner: greeting/header → FPT hero (Next up / resume)
    → Course of study → Resources (2e) → right rail.
2b. RENEWAL CARD: hidden entirely unless the learner's renewal window
    is open. Window = enrollment expires_at minus 30 days through
    expiry (derive; keep the existing visibility-prop component —
    this wires it). A fresh learner sees NO renewal surface.
2c. BONUS LIBRARY: not rendered at all until the FPT completion event
    exists. Post-completion: a card grid, one card per bonus course/
    module, each with an artwork slot (image path convention
    Brand/courses/<slug>.png via public assets; tasteful branded
    placeholder until real graphics land) + CE note + open action.
2d. HEADER STATS (replacing current trio): (1) "Modules N/M" —
    passed/total for FPT; (2) "Enrollment remaining" (unchanged);
    (3) "Designation" — expiration date when certified, "On
    certification" state before. CE stat REMOVED.
2e. RESOURCES SECTION (replaces the "Upon certification" benefits
    panel): cards linking out (new tab) to: Crypto Catalog
    (dacfp.com/cryptocatalog/), CBDA Registry (dacfp.com/
    cbda-directory/), Ric's white papers (dacfp.com/is-crypto-done/
    as the exemplar; label "Latest white paper"), Crypto Glossary
    (dacfp.com/glossary/), Certification FAQ (dacfp.com/
    certification/faq/). Icon + one-line description each.
2f. RIGHT RAIL: keep Enrollment term panel. REMOVE the CE credits &
    reporting panel entirely (CE returns later as its own tab; keep
    ce_credits data and credential-ID collection on Account
    untouched). ADD a DESIGNATION panel: pre-completion = "Complete
    all N modules to earn the CBDA designation" + seal; post-
    completion = status (Active), certified-on date, valid-through
    date (certified + 1 year, derived in sandbox), and a "View
    certificate" action → 2g.
2g. INTERIM CERTIFICATE VIEW: a branded, print-friendly certificate
    page (seal, learner name, designation, certified date, valid-
    through) reachable only when the completion event exists.
    Clearly interim — the full certificate engine is a later spec —
    but real enough to demo and print.

## 3. COURSE NAVIGATION POLICY
3a. First pass: sequential, exactly as built (modules unlock in
    order; quiz opens when required lessons complete).
3b. AFTER course completion: full free navigation — every module and
    lesson open for revisit in any order. (Derivation already yields
    this once all quizzes pass; ensure no UI blocks it and copy
    invites review.)

## 4. PLAYER POLICY (two-mode)
4a. FIRST-PASS MODE (lesson not yet complete, sequential courses):
    1x locked; 15s-BACK button always; 15s-FORWARD button permitted
    but clamped to max_watched (never advances into unwatched);
    scrubber seek same clamp (existing behavior).
4b. REVIEW MODE (lesson complete, OR course complete): YouTube-like —
    playback speed selector up to 2x, free seeking both directions,
    15s skip both ways. Applies per-lesson the moment that lesson
    completes.
4c. Server: lms-progress plausibility check must accept 2x review-
    mode heartbeats without false rejection (completed lessons no
    longer advance max_watched, so heartbeats in review mode may
    skip the growth check; verify and adjust the function
    accordingly). Open-progression courses keep their existing
    relaxed player.

## 5. MODULE PAGE
5a. Keep the T1 layout (landing page per module, faculty at a
    glance, right-rail quiz panel + "the course from here").
5b. "Quiz" vocabulary per §1. Copy states the unlock condition:
    "Opens when this module's lessons are complete."
5c. Lesson list: video-first presentation. Reading rows remain
    SUPPORTED (no capability removal) but lose visual prominence;
    the real catalog is video-only for now. Remove any "key
    concepts" style blocks if present.
5d. Resources stay per-lesson/module (e.g., Satoshi white paper
    download), clearly optional, never gating.
5e. Per-module CE chips removed from learner display (CE returns as
    a future tab; data retained).

## 6. PROFILE & SIGNUP EXPANSION (migration required)
6a. lms_learner_profiles gains: first_name, last_name (split from
    display name; migrate existing full_name sensibly), firm text,
    job_title text, phone text null, firm_url text null, address
    jsonb null (line1, line2, city, state, postal, country).
6b. SIGNUP collects: first name, last name, email, password, firm,
    job title. Address/phone/firm URL live on the Account page
    (optional), not signup — keep first-run friction low.
6c. ACCOUNT page: full identity section with all fields; job title
    is a dropdown (Financial Advisor, Wealth Manager, Portfolio
    Manager, Financial Planner, RIA Principal/Owner, Compliance,
    Operations, Analyst, Executive, Other + free text on Other).
    Credential-ID section unchanged.
6d. Identity is EMAIL-ONLY — no usernames (owner decision).
    RLS: all new columns owner-read/write via existing policies;
    verify no policy widening needed.
6e. Trigger/profile-creation path updated for the new shape; RPC
    lms_grant_enrollment unaffected (creates skeleton profile as
    today).

## 7. OUT OF SCOPE (explicit)
Enrollment/checkout flow (W1), CE tab (future R-series), real bonus
artwork (assets pending), certificate engine proper, firm-resolver
typeahead for the firm field (free text now; canonicalization at
launch), admin changes beyond what §6 fields require in the
inspector display.

## 8. GATE REQUIREMENTS (X1)
Standard three legs. Evidence must include: renewal-card visibility
proof (fresh learner sees none; a near-expiry synthetic sees it);
bonus invisibility pre-completion and card grid post; header stats
for both a mid-course and a completed learner; two-mode player
demonstration (first-pass clamp + review-mode 2x) with a plausibility
re-proof; quiz vocabulary grep; migration SQL + RLS check on new
columns; signup + account forms round-trip; interim certificate
render for a completed learner; suite green with justified updates.
