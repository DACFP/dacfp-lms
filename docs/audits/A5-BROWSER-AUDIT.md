# DACFP LMS browser audit — complete findings-only ledger

Audit complete at the required local origin. All discovered surfaces are marked **Tested** or **Blocked**; none remain unvisited. All fixture contracts matched, so no stop gate fired.

Summary: **11 defects — 4 High, 5 Medium, 2 Low.** No fixes were attempted.

## Verification and scope

- Origin allowlisting: **Passed**, including authenticated secure-video loading and playback controls.
- Repository changes: **None**; final `git status --short` was empty.
- Direct database/SQL/service-role/configuration access: **None**.
- Accounts created: **None**.
- State-museum writes: unchanged profile save; failed bonus-reading completion with no confirmed change; client-only quiz navigation.
- Operator writes: one disposable scratch course was created, exercised, and deleted. Its prior editor URL subsequently returned “Course unavailable,” and it was absent from the catalog.
- Live courses: opened read-only only; none saved, reordered, or deleted.
- Coverage evidence: 91 recorded learner route/state snapshots plus direct operator-control coverage and all ten live course editors.

## 1. Full surface inventory

### Route and guard inventory

| Route/surface | Status | Outcome |
|---|---|---|
| `/login` | Tested | Learner/operator success, invalid-credential generic error, sign-in/create-account modes, authenticated redirects. |
| `/reset` | Tested | Public recovery form and navigation rendered correctly. Sending recovery email was separately Blocked. |
| `/` | Tested | Redirected through the correct authenticated or signed-out home. |
| `/dashboard` | Tested | All six learner lifecycle actors; operator redirected to `/admin`; signed-out user redirected to login. |
| `/course/:slug/module/:n` | Tested | Completed, active, locked, expired, renewal, and six bonus-course variants. |
| `/lesson/:id` | Tested | Video first-pass/review/optional, reading, submitted survey, locked, and expired variants. |
| `/quiz/:moduleId` | Tested | Passed, multi-attempt retake history, zero-attempt locked, downstream locked, and expired variants. |
| `/account` | Tested | Full 17-control profile form, unchanged save, success notice, dismissal. |
| `/completion/:slug` | Tested | Earned, locked, and expired-access outcomes. |
| `/credentials` | Tested | Earned and not-earned outcomes. |
| `/certificate` | Tested | Credential alias rendered correctly. |
| Public wildcard | Tested | Authenticated learner returned to dashboard; signed-out dashboard guard independently verified. |
| `/admin` | Tested | Full catalog, create form, all ten live course cards, scratch-course lifecycle. |
| `/admin/course/:id` | Tested | All ten live editors, populated FPT editor, scratch editor, and deleted-course unavailable state. |
| `/admin/learners` | Tested | Found learner, missing learner, expanded enrollment/lesson inspection, support controls. |
| `/admin/ce-reporting` | Tested | Filters, preview, missing-ID exclusion, disabled create state, retained-run download action. |
| `/admin/audit` | Tested | 88-row audit view and scratch-operation evidence. |
| Unknown `/admin/*` route | Tested | Produced a blank screen; DEF-008. |
| Signed-out protected routes | Tested | `/`, dashboard, admin, credentials, certificate, and completion all resolved to login. |
| Learner-to-admin role guard | Tested | `/admin` redirected to learner dashboard. |
| Operator-to-learner role guard | Tested | `/dashboard` redirected to operator catalog. |

### State-museum actors

| Actor | Status | Contract and journeys exercised |
|---|---|---|
| `fresh` | Tested | Introduction 2/2 including submitted pre-course survey; Module 1 next; 1/5 and 0/4 quizzes; active/locked modules, lessons, quiz, completion, credentials, account. Contract matched. |
| `almostdone` | Tested | Naturally completed 5/5 and 4/4; completion, credential, Module 4, final quiz/history. Contract matched. |
| `midmodule` | Tested | Expired dashboard plus deep module, lesson, and quiz expiry panels; locked completion, credential, account. Contract matched; inconsistent dates logged as DEF-004. |
| `near-expiry` | Tested | 12 days remaining, renewal card, renewal module and one-hour first-pass video. Contract matched. |
| `failedquiz` | Tested | Mid-course 4/5; Module 3 history contained two failed attempts and a passed third attempt; Module 4 active with locked quiz/completion. Contract matched. |
| `fptcomplete` | Tested | 5/5, 4/4, completion and credential, entire flagship curriculum, bonus library, and expected orphan support card. Contract matched. |
| Operator | Tested | Catalog, every editor destination, scratch authoring/deletion, learner inspector, CE reporting, audit trail, desktop/mobile navigation. |

### Learner curriculum inventory

| Curriculum surface | Status | Coverage |
|---|---|---|
| Introduction | Tested | Module overview, orientation video, submitted pre-course survey review. |
| Module 1 | Tested | Overview, core, applied, optional reference, survey, quiz. |
| Module 2 | Tested | Overview, core, applied, optional reference, quiz. |
| Module 3 | Tested | Overview, core, applied, optional reference, quiz including retake history. |
| Module 4 | Tested | Overview, core, applied, optional reference, survey, final quiz. |
| Six bonus courses | Tested | Crypto Custody and Security, Spot Ethereum ETFs, NFTs, DeFi and DAOs, Staking/Lending/Borrowing, and GENIUS Act; module and reading routes for each. |
| Renewal 2026 | Tested | Dashboard card, module, first-pass video, locked quiz state. |
| Renewal quiz submission/completion | Blocked | Requires 57 minutes of natural first-pass viewing; fabricating progress would violate fixture-preservation constraints. |
| Renewal 2027 learner path | Blocked | No audited fixture was enrolled; operator editor was tested read-only. |
| Archived Bonus Sandbox learner path | Blocked | Not exposed to an audited learner; its three-module operator editor was tested read-only. |
| New pre-course survey submission | Blocked | Updated fresh contract already contains a submitted survey. |
| New completion transition | Blocked | Updated almostdone contract is already naturally completed. |
| New failed/passed quiz attempt | Blocked | Would mutate museum attempt history; existing failure and passed-retake states were verified instead. |

### Learner controls, forms, and modal states

| Item | Status | Outcome |
|---|---|---|
| Sign-in mode, valid submit, invalid submit | Tested | Both roles signed in; invalid login used the intended generic response. |
| Create-account mode and six fields | Tested | Form rendered and accepted client-side input inspection. |
| Create-account submit | Blocked | Account creation expressly prohibited. |
| Forgot-password link | Tested | Opened recovery route. |
| Send-reset-email button | Blocked | Would transmit an external recovery message. |
| Desktop Dashboard/Credentials/Account navigation | Tested | All destinations loaded. |
| Learner mobile menu/navigation | Tested | Menu opened and Account navigation worked at 390×844. |
| Sign out | Tested | Session ended, but inputs retained credentials; DEF-011. |
| Completion-contract Collapse/Show | Tested | Both disclosure states rendered. |
| Resume module/course-card links | Tested | Active, completed, locked, and expired destinations exercised. |
| Start renewal | Tested | Opened renewal course. |
| Five external resource cards | Blocked | Inventoried, but activation would leave the required local origin. |
| Contact-support/mail links | Blocked | Inventoried; external transmission was outside scope. |
| Video loading, native controls, ±15-second controls | Tested | Secure playback loaded; review and first-pass variants exercised. |
| Speed selector | Tested | Completed review video accepted 2×; first-pass renewal remained locked to 1×. |
| Previous/Next/Module overview destinations | Tested | Destination routes were traversed across representative lessons. |
| Mark reading complete | Tested | Attempted on GENIUS Act; failed with no confirmed state change; DEF-002. |
| Submitted survey review | Tested | Read-only submitted state rendered. |
| Survey answer/submit path | Blocked | No unsubmitted survey actor exists under the current fixture contract. |
| Quiz answer radios, Back, Next | Tested | Client-only navigation exercised without submitting a new attempt. |
| Quiz final submission | Blocked | Would mutate contract-fixture attempt history. |
| Account form and Save profile | Tested | All controls inspected; unchanged natural save succeeded and notice dismissed. |
| Print certificate | Tested | Button invoked. |
| Native print-dialog inspection | Blocked | Browser-native dialog is outside the page accessibility tree. |
| Terms-acceptance modal | Blocked | All current fixtures had already accepted terms; forcing it requires fixture mutation. |
| Session-expired modal | Blocked | Inducing it requires session manipulation outside the permitted journey. |

### Operator inventory

| Operator surface/control | Status | Outcome |
|---|---|---|
| Desktop and mobile operator navigation | Tested | Courses, Learners, CFP CE, Audit trail, Sign out; mobile at 390×844. |
| Ten live catalog Edit destinations | Tested | Bonus Sandbox, both renewal courses, FPT, six named bonus courses; every editor loaded read-only. |
| Create-draft form | Tested | Title, slug, description, and Create draft used on disposable scratch course. |
| Course settings | Tested | Title, slug, description, publication, progression, prerequisite, CE credits, terms checkbox, save. |
| Publish course | Tested | Scratch publication change saved. |
| Delete-course modal and confirmation | Tested | Named scratch course confirmed, cascaded children, disappeared from catalog, old URL unavailable. |
| Delete live/enrolled course | Blocked | Destructive action prohibited outside the scratch course. |
| Add/save module | Tested | Scratch module created and saved. |
| Transition bridge copy | Tested | Save reported success but value disappeared after reload; DEF-009. |
| Module up/down controls | Tested | Populated FPT controls exposed off-by-one state; DEF-010. |
| Module drag gesture | Blocked | Equivalent controls inspected; persisting a live-course reorder was prohibited. |
| Delete-module modal | Tested | Named scratch module dialog opened and cancelled. |
| Add/save reading lesson | Tested | Title, kind, body, path/duration fields and save. |
| Add/save survey lesson | Tested | Kind switch and save. |
| Lesson up/down controls | Tested | Scratch lesson ordering exercised in both directions. |
| Delete-lesson modal | Tested | Named scratch lesson dialog opened and cancelled. |
| Private text-resource upload | Tested | Title/content upload succeeded on scratch lesson. |
| Native file upload | Blocked | No supplied audit artifact; text-resource path covered permitted upload behavior. |
| Survey sections | Tested | Add, rename, move down/up, save. |
| Survey questions | Tested | Single-choice and text questions, required state, choices, free-text choice. |
| Conditional routing | Tested | Choice-to-section override saved and persisted after reopening. |
| Survey choice deletion | Tested | Disposable third choice added and deleted. |
| Survey results | Tested | Scratch 0-response and populated FPT 6-of-8/75% views, path distribution and denominators. |
| Survey CSV export action | Tested | Scratch, course-wide, and populated FPT export buttons invoked without UI error. |
| Download receipt validation | Blocked | In-app browser did not expose a download event/artifact. |
| Valid pasted question-bank import | Tested | Canonical 10-question JSON failed; DEF-005. |
| Existing question-bank JSON export | Tested | Populated FPT bank exported without revealing answer content. |
| Question-bank file chooser | Blocked | No file artifact supplied; pasted canonical import covered validation. |
| Learner search | Tested | Existing learner and no-result outcomes. |
| Enrollment/lesson inspector disclosure | Tested | Eight enrollments and per-lesson progress/resume/update information inspected. |
| Manual-complete controls | Tested | All eight inventoried; inaccessible naming defect DEF-006. |
| Confirm manual completion | Blocked | Would alter a museum fixture. |
| Reset-quiz modal | Tested | Uniquely named confirmation opened and cancelled. |
| Confirm quiz reset | Blocked | Would alter museum attempt history. |
| CE course checkboxes, dates, toggles | Tested | Course selection, date change/restore, already-reported/manual toggles. |
| CE Preview | Tested | 0 reportable, 1 missing identifier, one 14-day nudge. |
| Create `.xlsx` | Blocked | Disabled because no legitimate reportable rows; fabricating a duplicate correction was inappropriate. |
| Retained-run Download again | Tested | Action completed without UI error. |
| Retained-download artifact validation | Blocked | No browser download event was surfaced. |
| Audit trail table | Tested | 88 rows, current scratch activity, learner inspection, CE operations. |
| Unknown admin route | Tested | Blank-screen defect DEF-008. |

## 2. Severity-ranked defect ledger

### DEF-011 — High

**Severity:** High | **Where:** Sign-out → `/login` | **Happened:** The prior email and password value remained populated after sign-out; the password was masked visually but remained present in the input. | **Expected:** Authentication fields should be cleared when ending the session. | **Repro:** Sign in as operator → Sign out → inspect login fields.

![DEF-011 sign-out retains credentials](a4-audit/DEF-011-signout-retains-credentials.png)

### DEF-009 — High

**Severity:** High | **Where:** Operator course editor → module transition bridge copy | **Happened:** Save reported success, but reopening the scratch editor showed an empty value/placeholder. | **Expected:** Saved bridge copy should persist. | **Repro:** Create scratch course/module → enter bridge copy → Save module → reload/reopen editor.

![DEF-009 bridge copy does not persist](a4-audit/DEF-009-bridge-copy-does-not-persist.png)

### DEF-005 — High

**Severity:** High | **Where:** Operator course editor → question-bank import | **Happened:** A canonical ten-question JSON bank was rejected as unavailable; no change was confirmed. | **Expected:** A valid fixed-policy bank should import successfully. | **Repro:** Open scratch quiz bank → paste ten sequential questions with valid choices/correct IDs → Import.

![DEF-005 valid question-bank import fails](a4-audit/DEF-005-valid-question-bank-import-fails.png)

### DEF-002 — High

**Severity:** High | **Where:** Bonus reading lesson → Mark reading complete | **Happened:** Both page and toast reported that completion could not be saved; progress remained 0/1. | **Expected:** An eligible completed learner should be able to record bonus reading completion. | **Repro:** Sign in as completed learner → GENIUS Act module → reading lesson → Mark reading complete.

![DEF-002 bonus reading save fails](a4-audit/DEF-002-bonus-reading-save-fails.png)

### DEF-006 — Medium

**Severity:** Medium | **Where:** Operator learner inspector | **Happened:** Eight separate support actions all expose the same accessible name, “Manual mark complete.” | **Expected:** Each name should identify the course/enrollment and learner to reduce operational error. | **Repro:** Inspect the failed-quiz learner → enumerate manual-complete buttons.

![DEF-006 ambiguous manual-complete controls](a4-audit/DEF-006-ambiguous-manual-complete-controls.png)

### DEF-010 — Medium

**Severity:** Medium | **Where:** FPT operator editor → module reorder controls | **Happened:** Introduction at position 0 has an enabled Move up control, while the following Module 1 Move up control is disabled. | **Expected:** First row’s up control disabled; every later row’s up control enabled. | **Repro:** Open FPT editor → inspect Introduction and Module 1 reorder controls.

![DEF-010 module reorder off by one](a4-audit/DEF-010-admin-module-reorder-off-by-one.png)

### DEF-003 — Medium

**Severity:** Medium | **Where:** Fresh learner dashboard | **Happened:** Copy says every quiz was passed on the first or second attempt despite 0/4 quizzes passed, and says the Module 1 core lesson alone unlocks Module 2. | **Expected:** Zero-quiz wording and the actual required-lessons-plus-quiz progression rule. | **Repro:** Sign in as fresh learner → dashboard.

![DEF-003 fresh dashboard progression copy](a4-audit/DEF-003-fresh-dashboard-progression-copy.png)

### DEF-004 — Medium

**Severity:** Medium | **Where:** Expired learner dashboard → Enrollment term | **Happened:** Enrollment displays Jul 16, 2026 through Jun 27, 2026—expiration precedes enrollment. | **Expected:** Chronologically valid dates or an explicitly explained historical state. | **Repro:** Sign in as expired mid-course learner → dashboard.

![DEF-004 expired enrollment date order](a4-audit/DEF-004-expired-enrollment-date-order.png)

### DEF-008 — Medium

**Severity:** Medium | **Where:** Unknown nested admin route | **Happened:** After loading, the application rendered a completely blank page without shell, redirect, or not-found explanation. | **Expected:** Admin shell with a not-found state or redirect to the catalog. | **Repro:** Sign in as operator → open an unknown `/admin/...` path.

![DEF-008 unknown admin route blank](a4-audit/DEF-008-unknown-admin-route-blank.png)

### DEF-001 — Low

**Severity:** Low | **Where:** Optional video lesson | **Happened:** Heading identifies an optional reference, but supporting text says “Required video progress…” and the untouched optional lesson is labeled “In progress.” | **Expected:** Optional-specific copy and a neutral/not-started state. | **Repro:** Completed learner → Module 1 → Optional reference.

![DEF-001 optional lesson required copy](a4-audit/DEF-001-optional-lesson-required-copy.png)

### DEF-007 — Low

**Severity:** Low | **Where:** Operator audit trail after one CE-page load | **Happened:** Three identical `list_ce_report_runs` records appeared at the same timestamp. | **Expected:** One audit entry per intentional list operation, or deduplication of render-driven reads. | **Repro:** Open CFP CE once → open Audit trail.

![DEF-007 duplicate audit events](a4-audit/DEF-007-duplicate-audit-trail-events.png)

## 3. UX friction and copy observations

- The FPT catalog description says “four-module preview,” while the learner/editor surfaces contain Introduction plus Modules 1–4.
- The completion-contract disclosure changes from “Collapse” to “Show”; “Expand” would be the clearer inverse label.
- The populated FPT editor contains 179 inputs and many repeated generic controls such as “Save lesson,” “Delete,” and “Upload,” making keyboard and screen-reader targeting difficult.
- Reading and Survey lesson editors continue to show irrelevant video path/duration fields.
- A newly uploaded private text resource produced success feedback but did not appear in a persistent resource inventory with edit/delete controls.
- The audit trail has no search, filtering, pagination, or actor-email presentation; operators must scan raw IDs across 88 rows.
- CFP CE labels concatenate headings and helper copy in their accessible names without spacing.
- Download actions provide little durable confirmation, and artifact receipt could not be verified through the in-app browser.
- Expired learner navigation replaces the usual access-through summary with the email address, reducing lifecycle visibility.
- The expected orphan support card was present only on the designated completed fixture and was not treated as a defect.
- Desktop and mobile navigation otherwise remained usable, and the invalid-login response correctly avoided account enumeration.

## Attestation

`[SUPABASE: NONE | calls: 0]`
