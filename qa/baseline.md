# QA automation baseline

Baseline date: 2026-07-17  
Branch observed: `codex/qa-production-scale`

This document records the current automated test surface before production-scale local data and live-user QA are added. It is evidence of the checks named below only; it is not evidence that the deployed application works end to end.

## Tooling and scripts

The repository uses Vitest 4.1.10 with jsdom, Testing Library, and `@testing-library/jest-dom`. Vitest is configured in `vite.config.ts` with CSS enabled and `src/test/setup.ts` as its setup file.

The available package scripts are:

| Script | Command | Scope |
| --- | --- | --- |
| `npm test` | `vitest run` | Unit and jsdom component/route tests |
| `npm run lint` | `tsc -b --pretty false` | TypeScript checking only; no ESLint is configured |
| `npm run build` | `tsc -b && vite build` | TypeScript checking and production client bundle |

There is no configured Playwright, Cypress, or other browser E2E runner; no coverage provider or threshold; no visual-regression runner; no automated axe scan; no database or migration test runner; no Edge Function runtime test suite; and no CI workflow. The existing tests do not contact Supabase.

The only existing data fixtures are the six named mock/seed learner states and three sandbox courses. They are useful state fixtures, but they are not production-scale load data.

## Verified command evidence

All commands below were run from `/Users/jackmarshall/Desktop/DACFP LMS` on 2026-07-17. The working tree was clean before and after the run.

### Tests

Command:

```text
npm test -- --reporter=verbose
```

Result:

```text
Test Files  19 passed (19)
Tests       150 passed (150)
Start at    08:48:58
Duration    9.22s
Exit code   0
```

### Typecheck

Command and complete output:

```text
> npm run lint

> dacfp-lms@0.0.0 lint
> tsc -b --pretty false
```

Exit code: `0`.

### Production build

Command:

```text
npm run build
```

Result:

```text
> dacfp-lms@0.0.0 build
> tsc -b && vite build

vite v8.1.5 building client environment for production...
2145 modules transformed.
dist/index.html                     0.87 kB | gzip:   0.46 kB
dist/assets/index-Cme_CM74.css     88.34 kB | gzip:  14.60 kB
dist/assets/AdminApp-BB1HJ_8i.js   48.16 kB | gzip:  12.86 kB
dist/assets/Markdown-CWzoEGy3.js  121.64 kB | gzip:  37.12 kB
dist/assets/index-CqT1LkVh.js     661.86 kB | gzip: 190.85 kB
Build completed in 1.08s.
Exit code 0.
```

Vite emitted a bundle-size warning because the main JavaScript chunk is **661.86 kB**, above its 500 kB warning threshold. This is a performance risk to measure in a real browser, not a build failure.

## Current automated coverage and gaps

| Role / route / workflow | Current automated evidence | Material gaps |
| --- | --- | --- |
| Anonymous `/login` | Route renders; sign-in/create-account mode semantics are tested | Sign-in and signup success/failure, duplicate account, generic error equivalence, form validation, pending state, requested-route return, operator destination |
| Anonymous `/reset` | Route renders; reset transport failure is surfaced | Generic existing/nonexistent response, success screen, recovery-link session, mismatch, password update success/failure, expired recovery session |
| `/`, wildcard, and route guards | Cold logged-out `/` redirects with zero LMS data calls; learner is redirected from `/admin` | Signed-in root behavior, wildcard fallback, anonymous dynamic/admin routes, operator redirect from learner routes, null/malformed role |
| Learner `/dashboard` | Terms, locked bonus, FPT unlock, renewal, empty enrollment, expiry, RLS-hidden metadata, denied, offline/error states | Revoked access, retry actually succeeding, mixed access states, progress boundaries, resume selection across many enrollments |
| Learner module route | Normal route and a locked module render | Missing/no-enrollment/expired/revoked/terms/prerequisite distinctions, completed state, open-course behavior, resource failures |
| Learner lesson route | Normal and locked routes, resource presence, reading completion | Missing/no-enrollment/expired/revoked states, reading failure, navigation boundaries, signed-token failure/refresh, real media playback and seeking |
| Learner quiz route | Normal and locked routes, single/multi controls, passing result, module/course/bonus messages, attempt score denominator | Load retry, malformed/empty payload, 6/10 failure UI, real 7/10 boundary UI, unanswered submission, submit failure retention, edit/back flow, shuffle/retake |
| Learner `/account` | Credential fields; mutation failure and confirmed-write/refresh-failure | Normal save, trimming/clearing fields, validation, reset link, mid-session denial |
| Operator `/admin` | Operator catalog renders; learner redirect; initial unavailable and expired-session states | Empty catalog, create-course workflow, logout, mobile navigation |
| Operator course editor | Read-only 70% policy, update error paths, text resource upload, module-delete confirmation | Successful settings/status changes; module/lesson CRUD and reorder; binary upload constraints; question-bank UI import/export; missing course |
| Operator learner inspector | Structured learner/profile/enrollment facts | Search error/no result/empty enrollments, detailed attempt/progress states, both support actions, idempotency, refresh failure |
| Operator audit route | No direct route test | Empty/nonempty states, order, mobile table alternative, target formatting, mutation-to-audit linkage |
| Shared UI | Terms focus trap, route focus, result announcer, Markdown sanitization, mutation lifecycle helper | Menus, sign-out, banner retry/dismiss, keyboard-complete journeys, automated axe audit |
| Video/resource workflow | Player queue/timer/resume unit tests and pure seek/rate rules | Real browser media events, signed URL lifecycle, resource download, storage denial, expiry during playback |
| End-to-end learner workflow | Individual mocked stages only | Signup -> terms -> lesson -> quiz failure -> retake -> completion -> bonus unlock in one real-user journey |
| End-to-end operator workflow | Individual mocked admin surfaces only | Author -> publish -> enroll -> learner visibility/completion -> support action -> audit in one journey |
| Runtime/security boundaries | Pure functions, provider mapping, payload stripping, and source-identity checks | Live auth, RLS, database constraints, Edge Functions, storage, concurrency, and browser/network behavior |
| Nonfunctional | Some hand-authored accessibility behavior tests | Browser accessibility scan, keyboard audit, 320/375/768 layouts, cross-browser, slow network, reduced motion, load/performance at production scale |

## Finite risk-based test taxonomy

The next QA layer is bounded at 100 cases so completion can be measured:

| Priority | Class | Cases |
| --- | --- | ---: |
| P0 | Identity and route authorization | 12 |
| P0 | Progression and assessment integrity | 12 |
| P0 | Video/resource access and progress integrity | 10 |
| P1 | Learner route/state matrix | 18 |
| P1 | Account/profile workflows | 6 |
| P1 | Admin authoring workflows | 18 |
| P1 | Admin learner support and audit | 10 |
| P2 | Resilience, accessibility, device, and scale | 14 |
|  | **Total** | **100** |

The present suite covers meaningful pieces of these classes, but it cannot prove deployed behavior because it runs entirely in jsdom with mock providers. A clean local pass therefore remains a prerequisite, not the live-user acceptance result.
