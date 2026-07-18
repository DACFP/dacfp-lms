# DACFP Support Corpus — Pain-Point Analysis
Source: 13,639 Help Scout conversations (Learning Center 9,045 / Info
4,594), 2022 → mid-2026, full threads. All examples paraphrased; no
member identity appears in this document. Counts are keyword-classified
and multi-label; treat as magnitudes, not accounting. Known inflation:
intake forms mention "CFP" and firm names, padding those raw counts —
sub-probes below are the trustworthy signal.

## The headline: one pain dwarfs everything
**"I finished the course — where is my certificate/badge?" (~1,100
conversations, plus the two most-repeated canned replies in the entire
corpus).** The gap between completing in Absorb and receiving/under-
standing the Credly credential generated more support than any other
cause: what "completion" means, when the badge arrives, how to claim a
Credly account, how to download a PDF (26 identical replies), how to
print it (18), and "you still have a few items left" (27) — the
completion-status opacity reply.
**Disposition: SOLVED BY THE BUILD, if promotion keeps its promises.**
The new system owns the entire chain (completion event → designation →
DACFP certificate + verify page) with no third-party claim step, and
the dashboard shows exact completion state per module. Promotion-spec
requirements this adds: (a) the certificate must be downloadable as
PDF from the dashboard the moment it exists, (b) completion must
trigger an immediate email with the certificate and next steps —
the ~1,100 tickets are the spec for that email's content.

## Ranked themes, with dispositions

**1. Certificate/credential delivery & display (~5,000 raw; see above)**
Sub-signals: LinkedIn sharing help (644 — members actively want to
display the credential), download/print (120), Credly account/claim
trouble (64), wrong name or email on the badge (283).
→ Build solves delivery/download. NEW LEDGER ITEMS: a first-class
"Add to LinkedIn" page for the owned credential (CFP-Board-style URL
+ step-by-step — 644 conversations say this page pays for itself);
self-service display-name correction (or a one-click "request name
fix" reaching the admin inspector) — 283 tickets of name/email fixes.

**2. CE credits (585 "not reported/received" + 404 IWI/CFA + 191
how-many/eligibility)**
The single largest *systemic* anxiety: did my credits get reported,
when, how many, to whom. Steady across all five years.
→ CONFIRMS the CE workflow as first-class promotion scope (already
planned). Adds two requirements: a learner-visible "CE credits &
reporting status" panel (credential IDs already collected; show what
was/will be reported and when), and the completion email states CE
handling explicitly. The 585 "not received" tickets are what the
status panel prevents.

**3. Firm/enterprise + discounts (firm-signal heavy; discount/promo
1,039 clean)**
Discount-code questions are a top-3 billing driver; firm-paid
enrollment questions recur constantly.
→ Validates the sponsor-portal thesis with member-voice evidence
(useful for the Don brief). Promotion spec: discount handling on the
enrollment page must be self-explanatory (where the code goes, what
it applies to); the Schwab-class flows already modeled in the command
center cover the mechanics.

**4. Renewal mechanics (745 auto-charge/subscription/cancel + 85
renewal-course confusion; rising since 2024)**
What am I paying annually, will it auto-charge, how do I cancel, what
is the renewal course and where is it.
→ LARGELY SOLVED BY BUILT WORK: Flow 2's load-bearing copy ($99/yr
anniversary, cancel via info@dacfp.com) answers the top questions
*if surfaced in-product*; the entitlement dashboard's renewal-event
surface (O2, built with the visibility prop) is where those answers
belong on screen, not just in email. Requirement: the renewal card
states price, date, and cancel path in its body copy.

**5. Access & login (~440: password 234, Absorb-login confusion 162,
"never got my access email" 44)**
→ SOLVED STRUCTURALLY: native auth kills the Absorb-redirect
confusion class; the promotion claim-email flow must be bulletproof
(the 44 "never got the email" tickets argue for a resend-access
self-serve link on the login page — small NEW LEDGER item).

**6. Quiz/exam (181 issue mentions + 284 difficulty/retake theme —
concentrated 2023–24, sharply down since)**
→ Mostly historical; the built attempt history + explicit
"unlimited retakes, no cooldown" copy (already on the quiz page)
addresses the residue.

**7. Receipts/invoices (165) & refunds (66)**
→ Promotion spec: Stripe receipt emails on by default; a re-send
receipt path in the runbook. Refunds remain an ops-policy item for
the support runbook (not product).

## Temporal reading
Completion/progress problems collapsed from 1,120 (2022) to ~300/yr
(2024–26) — early-era content/platform issues were largely fixed.
Certificate-era spike in 2022 matches the initial cohort's badge
wave. Renewal questions rise from 2023 onward as the renewal program
matured. Learning Center volume peaked in 2025 (2,986). Roughly
7–8 conversations/day at peak — the support load the new system's
self-service surfaces are aimed at.

## The canned-answer test (answers typed often enough to be features)
1. "Still a few things left to complete" (27×) → the dashboard's
   per-module completion state, live since D5.
2. "Download your certificate from Credly here" (26×) → the owned
   certificate download button, promotion spec.
3. Print/framing instructions (18×) → one paragraph on the
   certificate page, ledger.

## Net-new ledger items produced by this analysis
1. "Add to LinkedIn" instructions page for the owned credential (644)
2. Self-service name-correction request flow (283)
3. Learner-visible CE reporting status panel (585)
4. Resend-access-email self-serve link on login (44)
5. Renewal card body copy: price/date/cancel stated in-product (745)
6. Completion email spec: certificate attached/linked, CE statement,
   LinkedIn link (the ~1,100-ticket email)
7. Certificate page print/framing note (18 identical replies)
