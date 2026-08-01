# C1 Gate Report — Real Certificate

Date: 2026-08-01

Status: **STOPPED AT THE C1 GATE.** No merge and no push were performed.

## Amendment 1

The user resolved the template/spec coordinate conflict in favor of the visible
blank field in the committed template. `C1-SPEC.md` was amended exactly as
directed:

Replaced:

> - NAME zone (center, ~y 39–48%): "First [Middle] Last" from the

With:

> - NAME zone (center, ~y 50.5–62%, centered 56.25%, measured from
>   the committed 3300x2550 template's blank field): "First [Middle]
>   Last" from the

## Numbered gate evidence

1. **Screen render on `fptcomplete`.** The signed-in `/credentials` screen
   renders the full-bleed template, live learner name, mixed-case completion and
   expiration dates, primary **Download / print** action, designation-separation
   sentence, and support line.

   Evidence:
   `/Users/jackmarshall/.codex/visualizations/2026/08/01/019fbe49-781e-7ce0-b1b2-14db36356c6a/c1-gate/01-fptcomplete-certificate-screen-final.png`

2. **Print preview render.** A dedicated Chrome window was used only for the
   native print preview, then closed. The preview shows one landscape page with
   certificate artwork and no app chrome. The saved PDF is one page at
   792 x 612 points (US Letter landscape), with no form, JavaScript, or
   encryption.

   Evidence:
   `/Users/jackmarshall/.codex/visualizations/2026/08/01/019fbe49-781e-7ce0-b1b2-14db36356c6a/c1-gate/02-native-chrome-print-preview.jpeg`

   Rendered output:
   `/Users/jackmarshall/.codex/visualizations/2026/08/01/019fbe49-781e-7ce0-b1b2-14db36356c6a/c1-gate/02-print-output.png`

   Source PDF:
   `/Users/jackmarshall/Downloads/DACFP Learning Portal.pdf`

3. **Long-name auto-fit and same-session UI reversion.** A temporary Account UI
   edit produced a 70-character first/middle/last name. Actual browser layout
   measured one client rect, `white-space: nowrap`, zero content overflow, and
   full horizontal and vertical containment in the name zone. Horizontal gaps
   were 0.803 px left and 0.810 px right; the fitted font size was 10.5684 px.
   The Account UI was then used in the same session to restore first name
   `FPT`, an empty middle name, and last name `Completed`; the saved-state toast
   and restored fields are shown.

   Long-name evidence:
   `/Users/jackmarshall/.codex/visualizations/2026/08/01/019fbe49-781e-7ce0-b1b2-14db36356c6a/c1-gate/03-long-name-middle-present-final.png`

   Reversion evidence:
   `/Users/jackmarshall/.codex/visualizations/2026/08/01/019fbe49-781e-7ce0-b1b2-14db36356c6a/c1-gate/04-profile-reversion-final.png`

4. **Middle name present and absent.** Item 3 shows the temporary middle name
   present in the rendered certificate. After the UI reversion, the certificate
   rendered exactly `FPT Completed`, with no middle-name placeholder or doubled
   spacing. Browser inspection also confirmed the template decoded at
   3300 x 2550 and the dates rendered with `text-transform: none`.

   Middle-name-absent evidence:
   `/Users/jackmarshall/.codex/visualizations/2026/08/01/019fbe49-781e-7ce0-b1b2-14db36356c6a/c1-gate/05-middle-absent-after-reversion-final.png`

5. **Suite green and change justification.** The final exact staged state passed:

   - focused C1 coverage: 2 files, 84 tests;
   - isolated full suite: 34 files, 269 tests;
   - TypeScript lint/build check;
   - production build;
   - `git diff --cached --check`.

   One post-fix full-suite invocation timed out while waiting for the unrelated
   `/dashboard` heading and remained on its loading skeleton. It was not counted
   as green and no product code was changed to mask it. The focused route suite
   had already passed, and the immediate isolated full rerun passed 34/34 files
   and 269/269 tests.

   Changes are limited to the C1 artifact, C1 navigation copy, print/screen CSS,
   the user-authorized C1 spec amendment, and coverage for template rendering,
   exact mixed-case dates, `/credentials` reachability, middle-name presence and
   absence, the print action, and 60-plus-character zero-clipping auto-fit.

6. **Branch and commit.** Branch: `codex/c1-certificate`. The exact gate commit
   hash is emitted in the accompanying gate handoff after this report is
   committed; a commit cannot contain its own hash.

## Scope confirmation

The template is the committed `Brand/certificate/cbda-certificate-template.png`
and independently decoded at exactly 3300 x 2550. The A4 rerun closeout is in
branch history (`f7682e1`, following `5488d9b`). Verification pages, issuance
records, and renewal certificates were not built. The final working-tree and
tracked-source/document scans contained zero forbidden production-reference
matches. Supabase MCP remained scoped to the sandbox project and was not called.

## Reviewer audit trail

### Pre-amendment reviewer findings — verbatim

> Discrepancies found:
>
> 1. `src/index.css`: the name zone is staged at `top: 50.5%` with `height: 11.5%`—y=50.5–62%, centered at 56.25%. C1-SPEC requires approximately y=39–48%, centered near 43.5%.
>
> 2. `src/components/CertificateArtwork.tsx`: auto-fit has a hard minimum of `artworkWidth * 0.006`. If a long name still exceeds the zone at that size, the algorithm cannot shrink further; `.certificate-name-zone { overflow: hidden; }` then clips it. This does not guarantee the required one-line fit for long names.
>
> 3. `src/index.css`: dates are visually forced to all-uppercase with `text-transform: uppercase`, so `Dec 31, 2026` renders as `DEC 31, 2026`, contrary to the explicitly specified display format.
>
> Within the permitted inputs, the staged diff does not include the template PNG or C1 gate evidence, so their presence, resolution, and fulfillment cannot be verified.

Disposition:

- Finding 1 was resolved by user-authorized Amendment 1.
- Finding 2 was resolved by removing the minimum font floor as a stopping
  condition. The implementation continues shrinking until measured content
  fits; the 60-plus-character unit test and 70-character wet proof both pass.
- Finding 3 was resolved by removing the uppercase transformation. Dates render
  in the required mixed case.
- The input-scope limitation was resolved outside the staged diff by the decoded
  template check and the numbered wet gate artifacts above.

### First post-amendment staged-diff review — verbatim

> Discrepancies found:
>
> 1. The C1 wet gate is not satisfied by the staged diff. There are no screen or print-preview screenshots, no ACCOUNT-UI long-name edit/revert evidence, no wet middle-name-present/absent evidence, no suite-green justification, and no branch/hash evidence. The required A4 rerun/current-surface audit is also not evidenced.
>
> 2. `src/App.routes.test.tsx` does not actually test the middle-name-absent case. The new test renders only `Avery Morgan Stone`; asserting that `Avery Stone` is absent merely reconfirms inclusion of the present middle name.
>
> 3. Reachability through the required entry points is not demonstrated. The completion test checks a link to `/credentials`, while certificate tests render `/certificate` directly; nothing in the staged diff proves `/credentials` reaches the new certificate. My Credentials entry-point behavior is likewise untested.
>
> 4. Print fidelity is untested. The test only verifies that clicking “Download / print” invokes `window.print()`. It does not verify landscape Letter dimensions, edge-to-edge artwork, hidden app chrome, PDF fidelity, or print-layout name fitting.
>
> 5. The long-name test uses mocked `clientWidth`/`scrollWidth`, not real browser font/layout measurement. It therefore does not prove zero clipping with the actual italic font and does not satisfy the required ACCOUNT-UI wet demonstration and revert.
>
> 6. Date typography is not explicitly implemented as small-caps. The CSS adds weight and letter spacing but no `font-variant-caps`/equivalent, and the tests verify only text content.
>
> 7. Date sizing is not reliably tied to certificate dimensions. `.certificate-date` uses `cqw`, but the staged CSS does not establish `.certificate-artwork` as a query container; the `clamp()` limits also prevent exact proportional scaling at smaller sizes. This weakens the specification’s scaling guarantee.
>
> 8. The staged tests verify only that the image URL contains `cbda-certificate-template`. They do not establish that the referenced asset is the authoritative 3300×2550, 300-dpi template. The staged diff itself contains no template asset change or dimension check.

Disposition:

- Finding 1 was a deliberate limitation of the two-input review. Items 1–6
  above supply the wet gate; the A4 rerun closeout is an ancestor of this branch.
- Finding 2 was resolved with a distinct absent-middle render and assertion.
- Finding 3 was resolved by running the completed and incomplete certificate
  tests through `/credentials`; completion and dashboard links already target
  that route.
- Findings 4 and 5 are deliberately wet-browser checks. The native Chrome
  preview/PDF and real browser layout measurements above supply that evidence;
  the unit mocks remain deterministic regression coverage rather than being
  represented as wet proof.
- Finding 6 was retained intentionally because the explicit user decision
  requires visually mixed-case dates (`Dec 31, 2026`). Applying small-caps or an
  uppercase transform would contradict that direction. Weight and letter
  spacing match the label styling already printed in the artwork.
- Finding 7 was resolved by establishing `.certificate-artwork` as the inline
  size query container. The clamp is retained only as a screen-readability
  bound; zone positions remain exact canvas fractions and print fidelity is
  demonstrated by the native preview/PDF.
- Finding 8 was an input-scope limitation. The required preflight independently
  decoded the committed asset at exactly 3300 x 2550, and the production build
  includes that imported asset.

### Final fresh-context staged-diff review — verbatim

> No discrepancies found.
