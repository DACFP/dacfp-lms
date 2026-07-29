# F7 Gate Report — A5 sweep closeout + performance

Status: **STOPPED AT THE F7 GATE — independent review and Jack's explicit `merge approved` are required before merge.**

This report records implementation evidence. It is not independent verification and does not authorize a merge.

1. **Ordered preflight**
   - `origin` matched `DACFP/dacfp-lms`; `main` was clean before branch creation.
   - The F6 merge was present in history.
   - `F7-SPEC.md` and `docs/audits/A5-BROWSER-AUDIT.md` were committed before implementation.
   - `SPEC.md` reported v3.2 and the forbidden-reference grep returned `0`.
   - Supabase MCP was scoped only to sandbox project `xfvaohvismisfdggfdfj`.

2. **§1 / DEF-011 — sign-out clears authentication inputs**
   - Signed out the operator through the local application.
   - Browser inspection found both email and password values empty.
   - The form, email input, and password input each reported `autocomplete="off"` in sign-in mode.

3. **§2 / DEF-009 — bridge copy persistence**
   - Created the disposable draft course `F7 Sweep Proof` and its `F7 Scratch Module` through the operator UI.
   - Saved `F7 bridge copy survives an operator save and reload.` and reloaded the editor; the exact value remained.
   - Sandbox SQL independently showed the same stored bridge value on the scratch module.
   - Read-only FPT Introduction inspection showed the committed copy: `See the full path ahead before beginning the Financial Professional Track.`
   - The audited module-save RPC is operator-gated, callable by service role only, writes one admin audit row, and preserves `bridge_copy` on create/update.

4. **§3 / DEF-005 — question-bank import, both required proofs**
   - On the scratch module, imported the auditor's canonical `{ questions: [...] }` shape with ten sequential questions. The UI confirmed `10-question bank imported at the fixed 70% policy.`
   - SQL showed quiz `question_count = 10` and exactly `10` stored question rows.
   - A deliberately broken canonical bank with a blank fifth prompt was rejected with the exact UI error: `Question 5 field "prompt" must be a non-empty string.`
   - Client and server validation now name the field, question position, and reason. The server creates the missing scratch quiz atomically before replacing its bank.
   - No answer content is included in this artifact.

5. **§4 / DEF-002 — reading completion write**
   - Root cause: `lms-progress` called `courseComplete` after the reading RPC committed, but the symbol was absent from its import list. The response therefore failed after the database write.
   - Added the missing import, retained byte-identical progression-engine copies, and deployed sandbox `lms-progress` version 10 with JWT verification enabled.
   - The required `fptcomplete@example.test` GENIUS Act route now renders `Complete`, checklist `1/1`, and a disabled `Reading complete` control.
   - SQL cites progress row `29338a1e-928e-4dc2-8d0a-b2abfb35a686`, with `completed_at = 2026-07-28T20:05:09.366156+00:00` and both playback positions `0`, which is the reading write committed during the A5 failed-response attempt.
   - **Evidence limitation:** the contract fixture already contained the completed row before F7 verification. Replaying the exact write would require a prohibited fixture reset. F7 therefore proves the landed row, the diagnosed post-write failure, the deployed correction, and the resulting 1/1 UI state, but not a second fresh write on that actor.

6. **§5 riders, cited individually**
   - **DEF-008:** `/admin/f7-not-found` rendered the complete operator shell, `Admin page not found`, and a return-to-catalog link.
   - **DEF-006:** read-only inspection of `failedquiz@example.test` exposed distinct controls such as `Manual mark complete FPT Sandbox for Quiz failed on 3` and equivalent course-specific names.
   - **DEF-010:** read-only FPT inspection showed Introduction's up control disabled and Bitcoin Foundations' up control enabled; logic now uses first/last rendered row identity rather than assuming position 1.
   - **DEF-003:** `fresh@example.test` showed `0 of 4 quizzes passed`, no all-quizzes-passed claim, and `Complete all required lessons in Module 1, then pass its quiz to unlock Module 2.`
   - **DEF-001:** the zero-second optional reference displayed optional-specific copy and neutral `Not started`; its checklist remained `3/3 complete · 1 optional`.
   - **Lesson editor rider:** live reading and survey editors omitted video path and duration controls.
   - **Expired-navigation rider:** `midmodule@example.test` displayed `Access expired Jun 27, 2026` in the global header, not the email address.
   - **Catalog rider:** FPT displayed `Introduction and Modules 1-4`, replacing the inaccurate four-module-preview copy.
   - **Disclosure rider:** the open control read `Collapse`; after activation its inverse read `Expand`.

7. **§6 performance — route-level bundle split**
   - Before: main entry `731.22 kB` (`207.16 kB` gzip); admin app `569.31 kB` (`179.45 kB` gzip); Vite emitted the over-500 kB advisory.
   - After: main entry `203.82 kB` (`63.74 kB` gzip); admin app `65.26 kB` (`16.06 kB` gzip); learner app `88.67 kB` (`21.75 kB` gzip); lesson/player `30.09 kB` (`8.51 kB` gzip); CE page `10.50 kB` (`3.28 kB` gzip).
   - The deferred workbook/export chunk is `489.73 kB` (`159.66 kB` gzip). The production build emitted no chunk-size advisory.
   - Route fallbacks use existing boot/page skeletons. Route and accessibility regression tests cover the lazy boundaries.

8. **Sandbox deployment, authorization, and origin proof**
   - Applied migrations `20260729000000_f7_sweep.sql` and `20260729001000_f7_bridge_copy_backfill.sql` to the sandbox.
   - Deployed `lms-admin` version 13 and `lms-progress` version 10; both were active with JWT verification enabled.
   - SQL verified `lms_admin_save_module` exists, service role can execute it, and authenticated users cannot execute it.
   - SQL verified the revised import RPC creates a missing quiz and the FPT description is current.
   - Preflight to the sandbox edge-function origin returned HTTP 200 with `Access-Control-Allow-Origin: http://localhost:5173`, validating the local dev origin before browser attribution.
   - Supabase attestation at gate preparation: `[SUPABASE: xfvaohvismisfdggfdfj | calls: 9]`.

9. **Automated verification and invariant checks**
   - `npm run lint`: pass.
   - `npm test`: `33` files passed; `265` tests passed.
   - `npm run build`: pass with no chunk-size advisory.
   - `git diff --check`: pass.
   - Repository forbidden-reference scan, excluding dependencies/build output/git metadata: `0` matches.
   - The source progression engine and all six edge-function copies share SHA-256 `2c39708ecd2d3f367665dcf3200dcd160f2236868a27bf26299b4f96dbc1eb1a`.

10. **Scratch cleanup**
    - Deleted `F7 Sweep Proof` through its named operator confirmation. The application confirmed `delete course succeeded.`
    - The former course URL then rendered `Course unavailable`; its module, quiz, and questions were removed by the existing cascade.

11. **PRE-GATE SELF-CHECK FINDINGS**
    - The fresh-context reviewer read only `F7-SPEC.md`, the A5 audit, and the staged diff. It found no answer-key exposure, forbidden project-reference leakage, unsafe public RPC grant, or progression-engine divergence.
    - **Resolved — performance evidence:** the reviewer correctly noted that the implementation-only staged diff did not contain §6's before/after measurements. Section 7 of this gate report now records the exact build numbers and advisory result.
    - **Resolved by wet evidence — backend behavior:** source-presence tests alone do not prove the new RPC behavior. Sections 3–5 therefore cite the completed browser round-trip, canonical import and named rejection, independent SQL row/count proof, and deployed reading-completion state. Local PostgreSQL emulation was not substituted for the required wet sandbox gate.
    - **Resolved — DEF-011 regression coverage:** added a behavioral test that signs in with populated fields, signs out through the learner shell, and verifies both remounted fields are empty with autocomplete disabled.
    - **Resolved — catalog copy consistency:** normalized mock and seed copy to the exact deployed `Modules 1-4` wording.
    - **Disclosed and retained — FPT bridge-copy backfill:** the migration writes the already committed seed copy into null FPT bridge fields at positions 0–4. This was required because read-only browser inspection found the pre-existing Introduction value absent. It does not use an operator live-save path and preserves every non-null authored value, but it is an intentional non-scratch catalog-data remediation beyond the scratch round-trip proof.
    - Reviewer limitation: spec-and-diff only; it did not inspect browser evidence, database behavior, command output, history, or unstaged gate evidence.

Branch: `codex/f7-sweep`.

Merge remains prohibited until Jack explicitly says `merge approved` after independent review.
