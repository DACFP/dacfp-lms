# DACFP LMS acceptance matrix

Inventory date: 2026-07-17  
Target under test: `https://dacfp-lms.vercel.app`  
Contract sources: `SPEC.md` v3.1 and `SPEC-OVERHAUL.md`  
Status vocabulary: `UNRUN`, `PASS`, `FAIL`, `BLOCKED`, `NOT-APPLICABLE`

This is the bounded acceptance contract for local and deployed QA. Source inspection proves that a surface exists; it does not prove browser, database, storage, Edge Function, or deployed behavior. Every executed case must record timestamp, build/commit, role, synthetic persona, viewport, exact steps, actual result, and screenshot/network/console evidence as applicable. Only sanitized identities and data may be used.

## Roles and authorization

| Role/state | Allowed surface | Required behavior | Source evidence |
| --- | --- | --- | --- |
| Anonymous | `/login`, `/reset` | Protected learner/admin routes redirect to login without LMS data reads. | `src/App.tsx:31-59`; `src/components/ProtectedRoute.tsx:5-34`; `src/components/AdminRoute.tsx:5-15`; `src/context/LmsContext.tsx:73-94` |
| Learner | Learner shell and all learner routes below | `/admin/*` redirects to `/dashboard`; content remains enrollment/gate scoped. | `src/components/AdminRoute.tsx:11-15`; `src/components/AppShell.tsx:24-159` |
| Operator | `/admin`, `/admin/course/:id`, `/admin/learners`, `/admin/audit` | Learner routes redirect to `/admin`; admin subtree is lazy-loaded and role-gated. | `src/components/ProtectedRoute.tsx:22-34`; `src/App.tsx:15-43`; `src/pages/AdminApp.tsx:23-36` |
| Authenticated null/unknown role | No admin authority | Admin is denied; learner-surface disposition must be explicitly verified and recorded. | `src/data/provider.ts:106-117`; `src/components/AdminRoute.tsx:14`; `src/components/ProtectedRoute.tsx:32-34` |
| Auth resolving | No content yet | A status screen renders until session resolution; no learner/admin data request begins early. | `src/components/ProtectedRoute.tsx:9-20`; `src/components/AdminRoute.tsx:8-10`; `src/context/AuthContext.tsx:42-79` |

## Route, page, control, input, and state inventory

| Route/page | Controls and inputs (all user-facing variants) | Required states and acceptance criteria | Source evidence |
| --- | --- | --- | --- |
| `/login` | `Sign in`, `Create account` mode buttons; conditional `Full name`; `Email`; `Password`; submit labels `Sign in`/`Create account` and pending variants; `Forgot your password?` | Login/signup modes preserve honest button semantics; required/native validation works; generic failures do not enumerate accounts; success returns to a safe requested route or role default. | `src/pages/AuthPages.tsx:72-208` |
| `/reset` | `Email`; `Send reset instructions`; `Back to sign in`; success `Return to sign in`; recovery `New password`, `Confirm new password`, `Update password`; success `Continue to dashboard` | Request response is generic for existing/nonexistent accounts; mismatch is local error; request/update pending, success, transport failure, invalid/expired recovery all resolve without a dead end. | `src/pages/AuthPages.tsx:213-290` |
| Global learner shell | Brand/home link; desktop `Dashboard`, `Account`, `Sign out`; mobile `Open menu`, same nav/sign-out; skip link | Desktop/mobile nav has the same reachable destinations; sign-out clears session; route focus lands on `#main-content`; footer preserves access/designation separation. | `src/components/AppShell.tsx:19-22,41-156`; `src/components/RouteFocus.tsx:16-33` |
| `/dashboard` | FPT `Resume lesson`/`Continue`/`Review course`; renewal `Start`/`Continue`/`Review renewal`; library `Resume lesson`/`Continue`/`Review course`; hidden/empty `Review account`; CE `Review account` | Render empty enrollment; FPT hero; renewal event; bonus library; active, in-progress, completed, prerequisite-locked, terms-required, expired, revoked, no-expiry, and RLS-hidden-course states. Access expiry and designation separation remain explicit. | `src/pages/DashboardPage.tsx:118-129,179-205,208-508`; `src/components/RenewalEvent.tsx:26-124` |
| `/course/:slug/module/:n` | Lesson `Open`/`Review`; secure resource download; quiz `Open quiz`/`Review or retake quiz`; available course-outline module links; `Back to dashboard` | Render not-found, no enrollment, prerequisite/terms/previous-module lock, expired/revoked, no-lessons, optional/required and complete/incomplete lessons, quiz attemptable/locked/absent, module passed, and open/sequential progression. | `src/pages/ModulePage.tsx:25-277` |
| `/lesson/:id` | Native video play/pause/seek/volume/fullscreen controls; player `Retry`; reading `Mark reading complete` and pending/complete variants; secure resource downloads; `Previous lesson`, `Next lesson`, `Module overview`, `Return to module`, `Back to dashboard` | Render not-found/no-enrollment/locked/expired/revoked; video token loading, ready, resume, playing, saved, complete, refresh and errors; reading loading/saving/complete/error; resource present/empty/locked/error; first/middle/last navigation. | `src/pages/LessonPage.tsx:49-212`; `src/components/LessonPlayer.tsx:27-391`; `src/components/SecureResourceLink.tsx:7-54` |
| `/quiz/:moduleId` | Dynamic radio/checkbox answer rows; `Back`, `Next`, `Review answers`; per-question `Edit`; `Submit attempt`; `Start quiz attempt`; error `Retry`; result `Retake quiz`, `Continue to module N`; sidebar `Back to module` | Render missing/no-enrollment/locked/expired/revoked; load/error; single/multi; question steps; unanswered review; submit pending/failure retaining answers; pass/fail; completion/next-module/bonus unlock messages; empty/history attempts; unlimited retakes. | `src/pages/QuizPage.tsx:34-500` |
| `/account` | `Full name`; read-only `Email`; optional `CFP ID`, `IWI ID`, `CFA ID`; `Save profile`; `Change or reset password` | Saving/saved/error states; values refresh from snapshot; optional values can be cleared; email cannot be edited; CE copy remains future-tense. | `src/pages/AccountPage.tsx:12-125` |
| Global operator shell | Brand/courses link; desktop/mobile `Courses`, `Learners`, `Audit trail`, `Sign out`; skip link | Same destinations on desktop/mobile; sign-out clears operator session; learner never sees this shell. | `src/components/AdminShell.tsx:14-84` |
| `/admin` | Create-course `Course title`, `Slug`, `Description`, `Create draft`; each catalog card `Edit course` | Create pending/success/error; duplicate/invalid slug; empty/nonempty catalog; draft/published/archived; successful create navigates to editor. | `src/pages/AdminPages.tsx:62-122` |
| `/admin/course/:id` course settings | `Title`, `Slug`, `Description`; `Publication`; `Progression`; `Prerequisite`; `CE credits`; read-only `Exam pass policy` 70%; `Require first-entry terms acceptance`; `Save course settings`; `Delete course`; `Back to courses` | Missing course; valid/invalid values; save pending/success/error; publication transitions; pass policy cannot be edited; course deletion is contextual, confirmed, audited, and synthetic-only during QA. | `src/pages/AdminPages.tsx:124-178,508-534` |
| `/admin/course/:id` curriculum | Module title and `Save module`; module drag grip; move up/down; delete; `New module title`/`Add module`; lesson `Lesson title`, `Kind`, `video_ref path`, `Duration seconds`, `Reading body`, `Required`, `Save lesson`, delete; lesson drag grip and move up/down; `New lesson title`/`Add lesson` | Module/lesson create/update/delete/reorder; pointer drag and touch/keyboard fallback persist equivalent order; boundary controls disabled; confirm cancel/confirm; empty modules/lessons; validation/error/success; concurrent repeat submission does not corrupt ordering. | `src/pages/AdminPages.tsx:180-217,280-552` |
| Question bank panel | `Export CSV`; CSV/JSON radios; paste textarea; file input; `Import and replace` | Round-trip CSV; JSON import; exactly 10; fixed 70%; malformed/empty/non-70 rejected; file read/import/export success/failure shown. | `src/pages/AdminPages.tsx:219-271`; `src/lib/adminCsv.ts` |
| Resource authoring | `Resource title`; file input; optional text resource textarea; `Upload`; read-only attached-resource list | Allowed/denied MIME, empty file/text, size limit, upload success/failure; refreshed catalog lists title/private reference and yields a learner-downloadable resource. | `src/pages/AdminPages.tsx:280-367` |
| `/admin/learners` | `Learner email`; `Inspect learner`; per enrollment `Manual mark complete`; uniquely module-labelled reset control per quiz; confirm Cancel/confirm | Initial, searching, error, no result, profile, no/multiple enrollments, detailed progress/attempt/completion evidence, action cancel/success/failure/idempotency/post-action refresh failure. | `src/pages/AdminPages.tsx:558-731` |
| `/admin/audit` | No mutation controls; desktop table and mobile card list | Empty/nonempty; newest-first; time/action/actor/target readable; long arrays/objects safely summarized; mobile and desktop contain equivalent facts. | `src/pages/AdminPages.tsx:623-702` |
| `/`, unknown learner route | Redirect only | `/` and unknown paths resolve to dashboard then the correct role gate. | `src/App.tsx:57-58` |
| Unknown `/admin/*` | Redirect only | Unknown nested admin path resolves to `/admin`, never a blank shell. | `src/pages/AdminApp.tsx:25-34` |

## Modal, dialog, announcement, and transient-state inventory

| Surface | Controls | Required behavior | Source evidence |
| --- | --- | --- | --- |
| First-entry terms dialog | `I accept and want to continue` | Non-dismissible by Escape/outside click; trapped focus; background inert; accepting/error; success refreshes access and closes. | `src/components/TermsModal.tsx:14-92` |
| Destructive confirm | `Cancel` plus contextual confirm (`Delete course`, `Delete lesson`, `Delete module`, `Mark complete`, `Reset attempts`) | Safe action receives initial focus; cancel has no mutation; one confirm invokes one mutation; target and consequences are named. | `src/components/ConfirmDialog.tsx:30-69`; `src/pages/AdminPages.tsx:324-334,425-435,516-534,657-673` |
| Operator session expired | `Sign in again` | Non-dismissible; logout then login navigation; shown for denied snapshot, mutation, inspect, and export paths. | `src/components/SessionExpiredDialog.tsx:26-62`; `src/context/AdminContext.tsx:61-145` |
| Mutation status banner | Optional `Retry`; `Dismiss status` | Success=status, error=alert, warning=status; retry executes supplied refresh; dismiss removes banner. | `src/components/MutationStatusBanner.tsx:9-57` |
| Quiz verdict announcer | No control | Pass/fail announced and focus moves to result heading. | `src/pages/QuizPage.tsx:141-159,177-180,221-231` |
| Skeleton/status surfaces | No control | Auth resolving, learner boot, reading load, quiz load, and admin boot are distinguishable from stuck screens. | `src/components/ProtectedRoute.tsx:9-20`; `src/components/Skeletons.tsx`; `src/pages/LessonPage.tsx:36-47`; `src/context/AdminContext.tsx:125-145` |

## End-to-end workflows

1. Anonymous root -> login -> learner destination, with zero premature LMS reads.
2. Signup -> learner role -> first-entry terms -> dashboard.
3. Password-reset request -> recovery link -> password update -> authenticated destination.
4. Dashboard resume -> lesson video/reading -> saved completion -> module quiz availability.
5. Deliberate quiz fail -> retained history -> retake -> pass -> next-module unlock.
6. Final FPT requirement -> one completion event -> bonus unlock -> bonus lesson access.
7. Renewal start/continue/complete/review, including open/closed and expired/revoked windows.
8. Profile credential-ID add/change/clear -> save -> refresh persistence.
9. Operator creates renewal -> configures -> adds/reorders modules/lessons -> uploads resource -> imports quiz -> publishes.
10. Synthetic learner enrollment -> course visibility -> resource/video access -> quiz completion.
11. Operator learner inspection -> reset attempts/manual completion -> refreshed evidence -> audit record.
12. Session expires during each protected read/write -> re-auth, with no false success.

## Exactly 100 finite risk-based acceptance cases

The classes and counts exactly reuse `qa/baseline.md`.

### P0 — Identity and route authorization (12)

| ID | Acceptance case |
| --- | --- |
| IA-01 | Cold anonymous `/` renders `/login` and issues zero `lms_` data requests before session resolution. |
| IA-02 | Anonymous direct `/dashboard` redirects to `/login` and retains a safe return path. |
| IA-03 | Anonymous direct module, lesson, quiz, and account URLs each redirect to `/login`. |
| IA-04 | Anonymous direct `/admin`, course editor, learners, and audit URLs each redirect to `/login`. |
| IA-05 | Valid learner login reaches the requested learner URL or `/dashboard`. |
| IA-06 | Valid operator login reaches `/admin`. |
| IA-07 | Learner direct `/admin/*` is redirected to `/dashboard` with no admin content flash. |
| IA-08 | Operator direct learner route is redirected to `/admin` with no learner data request. |
| IA-09 | Null/unknown app role cannot reach `/admin`; observed learner-route disposition is recorded. |
| IA-10 | Wrong password and nonexistent account show byte-equivalent generic user-facing failure content. |
| IA-11 | Sign-out from desktop and mobile menus clears the session and prevents Back from reopening protected data. |
| IA-12 | Unknown learner path resolves safely to dashboard; unknown admin path resolves safely to `/admin`. |

### P0 — Progression and assessment integrity (12)

| ID | Acceptance case |
| --- | --- |
| PA-01 | Sequential module 1 is available when enrollment, terms, prerequisite, and access gates pass. |
| PA-02 | Sequential module N remains locked until module N-1 passes. |
| PA-03 | Open-course modules are not sequentially locked. |
| PA-04 | Module without quiz passes only after all required lessons complete. |
| PA-05 | Quiz stays unavailable while any required lesson is incomplete. |
| PA-06 | Quiz payload exposes stable choice IDs and no `correct` key or answer-key equivalent. |
| PA-07 | A real 6/10 submission fails. |
| PA-08 | A real 7/10 submission passes. |
| PA-09 | Unanswered questions submit as zero credit without client grading. |
| PA-10 | Retakes are unlimited, have no cooldown, and increment attempt number once per submit. |
| PA-11 | Passing unlocks the next sequential module immediately after refreshed data loads. |
| PA-12 | Completing every FPT requirement creates exactly one completion event and unlocks bonus access. |

### P0 — Video/resource access and progress integrity (10)

| ID | Acceptance case |
| --- | --- |
| VR-01 | Enrolled, gated-in learner receives a short-lived playback URL and the raw private asset URL fails. |
| VR-02 | Unenrolled, terms-pending, prerequisite-locked, module-locked, expired, and revoked callers receive generic playback denial. |
| VR-03 | Sequential player clamps forward seek to furthest watched and always allows rewind. |
| VR-04 | Sequential player forces 1x; open course allows seeking and playback-rate choice. |
| VR-05 | Resume restores last saved position after full reload. |
| VR-06 | Heartbeats save on 15-second interval, pause, end, navigation/unmount, and never decrease max watched. |
| VR-07 | Implausible progress jump is rejected and the UI reports unsaved progress. |
| VR-08 | Video completes only at or above 95% watched. |
| VR-09 | Token expiry during playback refreshes without losing position or playing state, or offers a working retry. |
| VR-10 | Secure resource normal click downloads; raw URL, unenrolled access, and modified-click cannot bypass token checks or misnavigate. |

### P1 — Learner route/state matrix (18)

| ID | Acceptance case |
| --- | --- |
| LR-01 | Dashboard empty-enrollment state explains recovery and links to Account. |
| LR-02 | FPT hero shows accurate percent, CE credits, module states, expiry/no-expiry, and best resume action. |
| LR-03 | Locked bonus tells the learner to complete FPT and becomes actionable after completion. |
| LR-04 | Renewal renders as event and distinguishes start, continue, complete/review, not-open, expired, and revoked. |
| LR-05 | RLS-hidden enrolled course remains represented as expired/unavailable without leaking catalog details. |
| LR-06 | Revoked and expired dashboard cards preserve the access/designation distinction. |
| LR-07 | Required terms dialog blocks content, cannot dismiss, survives failure, and disappears after confirmed acceptance. |
| LR-08 | Invalid module URL renders Module not found with dashboard escape. |
| LR-09 | Unenrolled/locked/expired/revoked module shows the correct denial class and no active content control. |
| LR-10 | Module with zero lessons renders explicit empty state; no-quiz module explains completion rule. |
| LR-11 | Module list distinguishes required/optional and incomplete/complete lessons and accurate resource availability. |
| LR-12 | Invalid or unenrolled lesson renders a no-dead-end state. |
| LR-13 | Reading Markdown is sanitized/rendered; completion success and failure are visible and duplicate clicks are suppressed. |
| LR-14 | Lesson resources cover present, absent, locked, preparing, success, and failure states. |
| LR-15 | Previous/next/module navigation is correct at first, middle, and last lessons. |
| LR-16 | Invalid, unenrolled, or locked quiz renders correct state and module/dashboard escape. |
| LR-17 | Quiz one-question flow supports back/edit/review, single/multi choices, progress, mobile sticky action, and submit failure retention. |
| LR-18 | Quiz result announces/focuses verdict, shows possible-points denominator, history, retake, completion, and unlock messages. |

### P1 — Account/profile workflows (6)

| ID | Acceptance case |
| --- | --- |
| AP-01 | Account loads correct name and read-only authenticated email. |
| AP-02 | Full name is required, trimmed, saved, and persists after reload. |
| AP-03 | CFP, IWI, and CFA values can each be added, changed, and cleared. |
| AP-04 | Failed profile mutation shows no false success; confirmed-write/refresh-failure preserves the current view and offers recovery. |
| AP-05 | Password link reaches reset; recovery mismatch, expired link, success, and failure each have an exit path. |
| AP-06 | Existing and nonexistent reset emails receive the same confirmation; no address is disclosed. |

### P1 — Admin authoring workflows (18)

| ID | Acceptance case |
| --- | --- |
| AA-01 | Operator catalog handles empty and nonempty data; learner is denied. |
| AA-02 | Create draft validates title/slug/description, blocks duplicate submit, and navigates to the new editor. |
| AA-03 | Duplicate/invalid slug produces a recoverable error and no false catalog row. |
| AA-04 | Course title, slug, description, progression, prerequisite, CE credits, and terms setting save and refresh. |
| AA-05 | Draft -> published -> archived transitions persist and appear on catalog cards. |
| AA-06 | Pass policy remains read-only 70%; non-70 import is rejected. |
| AA-07 | Missing course id renders Course unavailable and Back to courses. |
| AA-08 | Module create/update/delete each succeed once, refresh, and write audit entries. |
| AA-09 | Module drag handle and up/down fallback produce the same persisted ordering. |
| AA-10 | Module first/last reorder controls disable correctly; rapid reorder cannot duplicate positions. |
| AA-11 | Lesson create/update/delete covers video and reading fields, required flag, and audit entries. |
| AA-12 | Lesson drag handle and up/down fallback produce the same persisted order and handle first/last boundaries. |
| AA-13 | Destructive course/module/lesson dialogs default to Cancel; cancel is inert and confirm performs one audited mutation against synthetic content. |
| AA-14 | CSV import creates/replaces exactly 10 questions at 70% and export round-trips byte-comparably. |
| AA-15 | JSON import succeeds; malformed, empty, wrong-count, and non-70 payloads fail visibly without replacement. |
| AA-16 | Question-bank file read, paste, export download, pending, success, and failure states are usable by keyboard. |
| AA-17 | Allowed binary and text resources upload; empty, disallowed MIME, and over-5-MB attempts fail safely. |
| AA-18 | End-to-end Renewal 2027 authoring through UI completes within 30 minutes and is learner-visible/playable/gradable after enrollment. |

### P1 — Admin learner support and audit (10)

| ID | Acceptance case |
| --- | --- |
| SA-01 | Exact normalized learner email search returns profile and credential IDs. |
| SA-02 | Nonexistent learner renders No learner found; transport failure renders recoverable error. |
| SA-03 | Learner with zero enrollments renders an explicit empty state. |
| SA-04 | Each enrollment exposes status/source/dates/terms/CE/percent, detailed progress, attempts, and completions. |
| SA-05 | Multiple quiz reset controls uniquely name their quiz/module target. |
| SA-06 | Reset confirmation cancel is inert; confirm deletes only the selected learner/quiz attempts and audits it. |
| SA-07 | Manual completion confirm is idempotent, affects only selected enrollment, and audits it. |
| SA-08 | Support success plus failed inspector refresh distinguishes completed mutation from stale display. |
| SA-09 | Audit is newest-first and every session mutation appears once with actor/action/target/time. |
| SA-10 | Audit empty, 250-row, long target, desktop table, and mobile card presentations preserve equivalent facts. |

### P2 — Resilience, accessibility, device, and scale (14)

| ID | Acceptance case |
| --- | --- |
| RA-01 | Learner initial boot uses skeleton; denied and network failures offer working Sign out/Retry and never hang. |
| RA-02 | Admin initial failure offers Retry; denied session offers non-dismissible re-auth rather than futile retry. |
| RA-03 | Expired operator session during list, mutation, inspect, and export consistently opens re-auth dialog. |
| RA-04 | Mutation success/error/warning banners announce correctly; Retry and Dismiss work by keyboard. |
| RA-05 | Route changes move focus to `#main-content` on auth, learner, and admin surfaces; initial load does not steal focus. |
| RA-06 | Terms and destructive dialogs trap focus, restore focus, block background interaction, and name title/description. |
| RA-07 | Full learner journey is keyboard-complete; quiz verdict is announced and focused. |
| RA-08 | Automated axe plus manual landmarks/headings/labels pass on every route and modal with no serious/critical issue. |
| RA-09 | Login, dashboard, module, lesson, quiz, account, and all admin pages work at 320px and 375px without clipped actions/horizontal page scroll. |
| RA-10 | All pages work at 768px and desktop; admin audit switches between equivalent mobile/desktop presentations. |
| RA-11 | Reduced-motion, 200% zoom, visible focus, and contrast checks preserve meaning and operation. |
| RA-12 | Slow/offline/reconnect testing covers auth, boot, quiz load/submit, profile, progress, resource, and admin mutations without false success. |
| RA-13 | Sanitized 10,000-learner/27,000-enrollment local data renders/searches within recorded budgets without browser crash or unbounded DOM growth. |
| RA-14 | Main bundle warning, route chunk loading, Core Web Vitals, memory, and repeated-navigation behavior are measured and handed off against explicit thresholds. |

### Count verification

| Class | Count |
| --- | ---: |
| Identity and route authorization | 12 |
| Progression and assessment integrity | 12 |
| Video/resource access and progress integrity | 10 |
| Learner route/state matrix | 18 |
| Account/profile workflows | 6 |
| Admin authoring workflows | 18 |
| Admin learner support and audit | 10 |
| Resilience, accessibility, device, and scale | 14 |
| **Total** | **100** |
