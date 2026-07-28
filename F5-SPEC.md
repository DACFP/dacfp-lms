# DACFP-LMS — F5: A4 REAL-DEFECT REMEDIATION

STATUS: Commit as F5-SPEC.md. One gated Codex session, branch
codex/f5-journeys. SPEC.md v3.2 Hard Rules govern. Scope = the A4
findings classified REAL (environmental and fixture classes are
resolved outside this session). A4's ledger IDs cited per item.
Gate artifacts never contain the production ref literal.

## 1. THE EXPIRED EXPERIENCE (A4-004 + copy defects)
a. Derivation fix: every dashboard/header surface (access-through
   date, months/days remaining, resume hero) derives from the
   RELEVANT enrollment's status+expiry — never a max() across
   enrollments. An expired FPT enrollment must not inherit a live
   bonus/renewal enrollment's dates.
b. A designed expired state: when the primary (FPT) enrollment is
   expired — header shows "Access expired <date>"; the hero replaces
   Resume with an "Access expired" panel: what they keep (record,
   designation status per its own clock), what restores access
   (renew if within the grace window / re-enroll past it — copy
   only; no payment wiring), and support contact. No Resume
   affordance anywhere; lesson/player routes for expired
   enrollments render the same explicit state instead of generic
   "unavailable" (server denials already correct — this is honest
   presentation of them).
c. The load-bearing separation sentence remains verbatim.
d. Playback reference resolution: in `lms-playback-token`, resolve
   `video_ref` before asset handling. Any ref beginning
   `placeholder://` resolves to `PLACEHOLDER_PATH`, then follows the
   existing placeholder ensure-and-sign flow. Refs without that scheme
   pass through unchanged as literal storage paths. Apply the same
   resolution anywhere else `video_ref` is treated as a storage path,
   with unit coverage for both forms.

## 2. LOCK-COPY BLOCKER DERIVATION (A4-010)
The "what unlocks this" derivation walks the ACTUAL blocking chain:
the nearest incomplete requirement — a quiz-less previous module's
incomplete required lessons (e.g., the Introduction survey) is named
and linked, not that module's nonexistent quiz. Locked cards
COLLAPSE to one guided next step: the single current blocker,
stated once (fixes the repeated-CTA noise).

## 3. AUTH ROUTING (A4-007, A4-008)
a. Authenticated visits to /login redirect to role home (operator →
   /admin, learner → /), replacing the rendered login form.
b. Post-login destination is the new actor's role home UNLESS a
   same-session redirect param points into their own permitted
   routes; cross-actor deep-route inheritance eliminated (clear any
   stored return-path on sign-out).

## 4. ORPHAN/UNRESOLVABLE ENROLLMENT CARDS (A4-009)
An enrollment whose course cannot resolve renders one precise state
("This course is no longer available — contact support") — or is
suppressed when a sibling active enrollment for the same track
exists. No generic "Course access unavailable" beside healthy
content.

## 5. NEAR-EXPIRY HEADLINE (friction)
Under 31 days remaining, the enrollment-term headline switches to
day-granularity ("12 days remaining"), never "0 months remaining".
Renewal-card copy unchanged.

## 6. GATE (F5)
Numbered evidence, wet where visual: expired actor's dashboard +
lesson route showing the designed state and correct dates (midmodule
after re-stage); fresh actor's locked cards showing one linked blocker:
the nearest incomplete required step (for the live fresh fixture,
Introduction position 1, the welcome lesson), then a natural journey
write completing position 1 and advancing that single blocker to
Introduction position 2, the survey; /login redirect proofs both roles;
cross-actor route-inheritance repro now landing on role home; orphan-card
resolution on fptcomplete; "12 days remaining" on near-expiry; suite
green with justified changes; branch + hash.
