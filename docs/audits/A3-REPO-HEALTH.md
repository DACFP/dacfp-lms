# LEG A3 — REPO HEALTH AUDIT (DACFP/dacfp-lms)
Auditor: Claude (full-history clone). Executed 2026-07-28.
VERDICT: PASS with three recorded dispositions.

## Findings
1. SECRET SCAN (all objects, all branches, full history): ZERO
   credential material — no JWTs (eyJhbGci...), no sb_secret, no
   Stripe keys (sk_live/sk_test/whsec_), no bearer tokens, no .env
   history. 520 'service_role' hits are SQL grant statements, not
   secrets.
2. PRODUCTION REF IN HISTORY: present in 4 pre-redaction blobs
   (V1b gate artifacts before commit 09e47b0's redaction).
   DISPOSITION (recorded decision): ACCEPT without history rewrite —
   a project ref is not a credential (no keys ever in history; RLS
   + auth guard the project), the repo flips PRIVATE at promotion,
   and rewriting published history costs more than it buys.
3. BRANCH HYGIENE: 22 remote branches at audit time. PLAN: delete
   all merged codex/* and claude/* branches post-verdict (merge
   commits preserve history); keep main. STATUS: pending execution.
4. QUARANTINE BRANCH (codex/qa-loop-artifacts, commit 51a615c):
   reviewed. Code unsalvageable (130 files / 15,666 deletions
   behind main). Defect ledger valuable: 15 findings; majority
   independently fixed by O/X/F series; residue (QA-DEF-011 admin
   pending states — CLOSED by F6; QA-DEF-013 login revisit — CLOSED
   by F5; others) fed A4/A5. DISPOSITION: extract qa/*.md into
   docs/audits/qa-loop/ for the record, then delete the branch.
   STATUS: pending execution.
5. FILE HYGIENE: .DS_Store present under docs/ (gitignore addition
   recommended); no large-file or lockfile-integrity issues found.

## CI-readiness inputs (for the CI session charter)
- Admin integration tests need environment-aware timeouts (author-
  set 10–20s allowances fail on slow runners; recurred across
  V1/V1b/X2/R1 reviews).
- npm ci requires cdn.sheetjs.com egress (xlsx 0.20.3 CDN pin) —
  vendor the tarball or swap to exceljs if runner egress is
  restricted; Claude's review container is blocked (403) since F4.
- Standing greps to encode: forbidden production ref; secret
  patterns; per-function config.toml coverage test exists (F3).
- A1's core prescription stands: an authorization-boundary
  integration suite and a per-merge scripted smoke journey.
