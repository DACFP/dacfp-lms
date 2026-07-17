# DACFP Brand Tokens — authoritative, extracted from Brand/ assets
Source: cluster-averaged from DACFPStackedBlackText.png, SEAL_NEW.png,
DACFP_Masthead_cert.jpg (commit 02582e1). Contrast ratios computed
per WCAG; AA text = 4.5:1, large-text/UI = 3.0:1. This file is the
required input for SPEC-OVERHAUL.md §1 token mapping. O1 maps these
into the shadcn CSS variables; values here are settled, not advisory.

## Core palette (measured)
| token          | hex      | source            |
|----------------|----------|-------------------|
| dacfp-maroon   | #802124  | logo primary mark |
| dacfp-blue     | #1756a7  | logo cube blue    |
| dacfp-navy     | #172c4a  | masthead ground   |
| dacfp-navy-2   | #15335c  | masthead accent   |
| dacfp-gray     | #969ca0  | logo gray         |
| dacfp-gold     | #a67e41  | seal core gold    |
| dacfp-gold-hi  | #dec583  | seal highlight    |
| dacfp-gold-dk  | #826535  | seal shadow       |

## Derived accessible variants (required — do not use raw where noted)
| token             | hex      | purpose                                  |
|-------------------|----------|------------------------------------------|
| dacfp-gray-text   | #57616c  | ONLY gray permitted as text on light (6.3:1) |
| dacfp-gold-text   | #7d5a24  | ONLY gold permitted as text on light (6.25:1) |

## Contrast facts (measured — the allowed-background law)
- maroon on white: 9.72 ✓ — primary buttons/text, unrestricted
- blue on white: 7.18 ✓ — links/secondary, unrestricted
- navy on white: 14.04 ✓ / white on navy: 14.04 ✓ — ink pair
- gray #969ca0 on white: 2.78 ✗ — decorative only on light;
  on navy: 5.05 ✓ — full text use permitted on dark
- gold #a67e41 on white: 3.7 — large-text/UI/icons only on light,
  never body text; on navy: 3.8 — large/UI only
- gold-hi #dec583 on navy: 8.3 ✓ — THE gold for text on dark surfaces
- white on maroon: 9.72 ✓ — button-foreground pair

## shadcn CSS-variable mapping (O1 implements exactly)
--primary: dacfp-maroon; --primary-foreground: white
--secondary: dacfp-navy; --secondary-foreground: white
--accent: dacfp-gold (decorative surfaces) with foreground navy
--destructive: derive from maroon family (darkened), not a new red
--ring: dacfp-blue
--muted-foreground: dacfp-gray-text (light mode)
--background: white / --foreground: dacfp-navy
Card headers/eyebrows: navy; links: dacfp-blue; the brand gradient
strip: navy → navy-2 → gold-hi (tokenized once per SPEC-OVERHAUL §1)
Dark surfaces (hero/masthead regions): navy ground, white/gold-hi
text, gray permitted.

AMENDED O2 (ratified from O1 finding D1): --accent is divorced from
brand gold and is now dacfp-wash-blue with foreground navy (12.26:1),
because shadcn uses --accent as a small-text hover ground where gold
carried navy at only 3.80:1. Gold expresses ONLY via the explicit
dacfp-gold-* utilities under the law above. The .on-navy ring override
(--ring: gold-hi, 8.30:1, where dacfp-blue would be 1.96:1) is ratified.

## Logos & marks (usage)
- DACFPStackedBlackText.png → light surfaces
- DACFPStackedWhiteText.png → navy/dark surfaces
- SEAL_NEW.png → CBDA seal; never recolor; min display ~48px
- DACFP Logo.ai → vector master (source of truth for print/scale)

## Rules for O1
1. dacfp-gray and dacfp-gold NEVER as body text on light — the
   derived -text variants exist for exactly that.
2. Every token above ships with its allowed-background comment in the
   CSS per SPEC-OVERHAUL §1; this table is that comment's content.
3. No new colors without a flagged justification. Slide-deck greens
   and purples in Brand/ are content art, not palette.
