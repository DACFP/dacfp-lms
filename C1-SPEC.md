# DACFP-LMS — C1: REAL CERTIFICATE IN-LMS (Credly-replacement, learner half)

STATUS: Commit as C1-SPEC.md with the template at
Brand/certificate/cbda-certificate-template.png. Runs AFTER the A4
re-run completes (it audits the current surface first). SPEC.md v3.2
Hard Rules govern. RENEWAL certificates are explicitly OUT OF SCOPE
(owner decision) — this is the FPT certificate only.

## 1. THE ARTIFACT
Replace the interim certificate view with the real design: the
committed template PNG rendered full-bleed as the certificate
background, with live text overlaid in three zones (positions as
fractions of the 792x610 canvas so scaling stays true):
- NAME zone (center, ~y 39–48%): "First [Middle] Last" from the
  learner profile (middle included when present), in a large italic
  serif closely matching the design's script feel (a bundled/system
  serif italic at weight — no new font dependency unless flagged);
  auto-shrink to fit long names on one line.
- COMPLETION DATE zone: the completion event's date, "Dec 31, 2026"
  format, matching the small-caps label styling already in the art.
- EXPIRATION DATE zone: completion + 1 year, same format.

## 2. BEHAVIOR
- Reachable exactly as the interim view is today (completion event
  required; My Credentials + completion screen link to it).
- Print stylesheet: landscape US Letter, artwork edge-to-edge, no
  app chrome — browser print/Save-as-PDF yields the certificate
  faithfully. "Download / print" is the primary action.
- Screen view centers the certificate at a readable size with the
  designation-separation sentence and support line beneath (outside
  the artwork).

## 3. NOTES
- The template source is 72dpi (792x610) — crisp on screen,
  acceptable in print; when the original high-res template arrives
  from the designer it is a drop-in file swap, zero code.
- Verification page, issuance records, and renewal certificates
  belong to the later certificate-engine spec — do not build here.

## 4. GATE (C1)
Wet evidence on fptcomplete: screen render (screenshot), print
preview render (screenshot), long-name auto-fit demonstration (via
a temporary profile edit through the ACCOUNT UI, reverted the same
way), middle-name present and absent both shown; suite green with
justified changes; branch + hash. Gate artifacts never contain the
production ref literal.
