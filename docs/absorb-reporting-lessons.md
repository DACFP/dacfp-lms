# ABSORB-ERA REPORTING LESSONS (evidence from the command-center record)

Source: preserved command-center audit reports and task history,
2026, compiled without code or data changes. This document exists so
the failures of the vendor era shape the owned platform permanently.
No production identifiers appear here.

## The central finding
Absorb was often a source of evidence but not the source of truth.
Nearly every reporting incident came from treating five distinct
layers as interchangeable: cache state, payment state, completion
state, credential state, and dashboard copy. The LMS's structural
answer: the platform IS the system of record. Completion events are
truth; certificates, CE reports, and dashboards derive from them.
There is no vendor cache to go stale and no sync to fail.

## The non-negotiable reporting rules (carried forward)
1. LABEL SYSTEM-OF-ORIGIN. Every metric names the system and object
   it derives from, and the copy must match the query. (Root
   incident: dashboard cards whose stated sources differed from the
   tables actually queried.)
2. SEPARATE EVIDENCE LAYERS. Page copy, network evidence, payment,
   queued fulfillment, access, and credential state are reported
   separately and never inferred from one another. (Root incident:
   success pages saying "payment received" without validating the
   session.)
3. SURFACE UNKNOWN/UNPROVEN STATES. A guarded path that has not
   fired on real data is a watch item, never a "proven" claim.
   (Root incident: first-real-completion behavior claimed versus
   watched.)
4. NEVER STITCH ERAS SILENTLY. Legacy-vendor-era data and owned-era
   data may only combine under an explicit stitching contract with a
   cutover marker and double-count prevention. (Root incident:
   legacy revenue cards silently excluding live-era revenue; no
   first-live transition marker.)
5. POPULATION DEFINITIONS ARE CONTRACTS. Course and cohort feeds
   must be defined views, not keyword filters. (Root incident:
   Investor Track records leaking into the FPT completion feed.)
6. DELETING A COPY IS NOT DELETING THE RECORD. Cache or local
   deletion proves nothing about the external system; verification
   happens at the origin. (Root incident: cleaned cache rows
   restored by the next sync.)
7. RECONCILIATION REPORTS EXPIRE. A branch or state reconciliation
   is true only at its timestamp; re-verify before acting on it.
   (Root incident: a stale-branch reconciliation later proven
   wrong, forcing a rebuild from main.)

## Where the LMS already encodes these
- Rule 1 → M1-SPEC §0: a dashboard tile's count must equal the row
  count of the filter it links to; counts derive from canonical
  shared queries.
- Rule 2 → the renewal launch's state-only fulfillment pattern;
  carried into W1: checkout success states derive from verified
  server state, never page assumption.
- Rule 3 → the gate protocol itself: wet evidence or watch item,
  never "should work."
- Rule 5 → single-course world today; M2 analytics and any future
  multi-course reporting must define populations as views.
- Rule 6 → vendor-exit chore: Absorb-side deletion/closure is
  verified at Absorb, never inferred from LMS state.
- Rule 7 → standing verification discipline: clone-and-check plus
  live DB at every gate.

## Open items this record adds to specs
- W1: explicit launch/cutover markers for owned-era reporting; the
  legacy/live stitching contract if any Absorb-era figure is ever
  shown beside LMS-era figures; success-page state validation as a
  named requirement.
- M2: population-as-view definitions for all analytics surfaces.
- Vendor exit: origin-verified data disposition checklist for
  Absorb account closure.
