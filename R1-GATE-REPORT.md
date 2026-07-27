# R1 Gate Report — CFP CE reporting

Status: **STOPPED AT R1 GATE — independent review required before merge.**

This report records implementation evidence. It is not independent verification and does not authorize merge.

1. **Ordered preflight**
   - Repository remote matched `DACFP/dacfp-lms`; `main` was clean before branch creation.
   - X2 merge commit was present.
   - `R1-SPEC.md` and `docs/cfp-ce-template.xlsx` were committed before implementation.
   - `SPEC.md` header was `SPEC v3.2`; Hard Rule 1 grep returned `0`.
   - Supabase MCP was scoped only to the LMS sandbox.

2. **Migration and Program ID seed proof**
   - Migration: `supabase/migrations/20260727160000_r1_ce_reporting.sql`.
   - Added nullable `lms_courses.cfp_program_id` and nullable `lms_learner_profiles.middle_name`.
   - Added forced-RLS `lms_ce_report_runs` with frozen JSON rows and atomic report-run/audit RPC.
   - Live sandbox proof after migration:

     | Course | CFP Program ID | Modules | Status |
     | --- | ---: | ---: | --- |
     | FPT Sandbox | 312442 | 5 | published |
     | Crypto Custody and Security | 332761 | 1 | published |
     | Spot Ethereum ETFs | 328447 | 1 | published |
     | NFTs | 321877 | 1 | published |
     | DeFi and DAOs | 321876 | 1 | published |
     | Staking, Lending and Borrowing | 321875 | 1 | published |
     | GENIUS Act | 339638 | 1 | published |
     | Renewal 2026 Sandbox | null | 1 | published |
     | Renewal 2027 Sandbox | null | 1 | published |

   - The former three-module synthetic bonus container was preserved as archived so its historical completion was not deleted.
   - Each of the six bonus courses received all eight existing FPT sandbox enrollments.

3. **Authenticated wet-run preview**
   - Signed in through the local app as the existing synthetic operator `d6operator@example.test`.
   - The account passed the application operator gate without any role or metadata change.
   - Deployed `lms-admin` version 7 was active with JWT verification enabled.
   - Scope: all seven reportable courses, `2026-06-27` through `2026-07-27`, already-reported toggle off.
   - Preview result: `1` reportable, `1` missing ID, `0` already reported, `2` certifications in the 10-day nudge.
   - Reportable: `complete@example.test`, FPT, completed `2026-07-16`, CFP ID `SYNTH-CFP-1042`.
   - Missing ID: `fptcomplete@example.test`, FPT, completed `2026-07-16`, explicitly listed as missing.

4. **Export and frozen record**
   - The authenticated UI confirmed: `Exported 1 row and recorded the frozen report run.`
   - Report run ID: `98f1e638-e49e-4bfe-bd7f-75186a1aded6`.
   - Filename: `cfp-ce-2026-06-27-through-2026-07-27.xlsx`.
   - Frozen row:

     | CFP Program ID | Date Individual Completed | Attendee CFP Board ID | Attendee Last Name | Attendee First Name | Attendee Middle Name |
     | --- | --- | --- | --- | --- | --- |
     | 312442 | 2026-07-16 | SYNTH-CFP-1042 | Complete | Fully | *(blank)* |

5. **Workbook/template proof**
   - Sheet name: `Reporting Template`.
   - Header row matched the template byte authority exactly, in the same six-column order.
   - Date cell was numeric Excel serial `46219`, formatted `m/d/yy`, displayed as `7/16/26`.
   - Workbook opened through the workspace spreadsheet renderer; semantic inspection returned exactly two rows by six columns.
   - Formula/error scan matched `0` entries.

6. **Already-reported exclusion and history**
   - Automatic re-preview after export showed `0` reportable, `1` missing ID, and `1` already reported.
   - Run history survived a page reload and exposed `Download again` from the frozen row payload.
   - A run ending today now defaults the next scope to today rather than an invalid tomorrow-to-today range.

7. **Learner-state proof**
   - Sandbox state derived from frozen rows:
     - `complete@example.test`: CFP ID present; `reported_at` equals the run timestamp.
     - `fptcomplete@example.test`: CFP ID absent; `reported_at` is null.
   - Route tests verify the post-certification Account panel copy for missing-ID, scheduled, and reported states, and verify the block is hidden before certification.

8. **Audit and RLS proof**
   - Audit action `export_cfp_ce_report` was written at the same timestamp and with the same actor as the run.
   - `lms_ce_report_runs`: RLS enabled `true`; RLS forced `true`; policies `0` by design.
   - `anon` SELECT: `false`; `authenticated` SELECT: `false`; `service_role` SELECT: `true`.
   - Security advisor reported the no-policy table as informational, consistent with service-role-only access. It also flagged the learner status RPC as security-definer; this is intentional because the table is not learner-readable, and the function filters strictly by `auth.uid()` while returning only the signed-in learner's completion/report dates.

9. **Automated verification**
   - Typecheck/lint: pass.
   - Vitest: `24` files passed; `198` tests passed.
   - Production build: pass; authoritative workbook emitted as a build asset.

10. **Dependency evidence**
    - SheetJS package `xlsx@0.18.5` is the one authorized project dependency addition for R1.
    - No other project dependency was added.

Branch: `codex/r1-ce`.

Merge remains prohibited until Jack explicitly says `merge approved` after independent review.
