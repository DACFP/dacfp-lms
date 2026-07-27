# DACFP-LMS — TRUST & MOMENTUM POLISH (X2) — from the behavioral research

STATUS: Commit as X2-SPEC.md alongside docs/ux-research/ (the three
ChatGPT Work deliverables — commit them; they are the evidence base,
PII-free). Runs after V1 (any order vs V1b/R1). Presentation +
light-behavior session; SPEC.md v3.2 Hard Rules govern. Pattern IDs
reference the Pattern Library workbook.

## 1. ORIENTATION & CONTRACT (P03, P43-lite)
- "How you earn the CBDA" card on the dashboard for not-yet-complete
  learners: complete N modules · pass each 10-question quiz at 70% ·
  unlimited attempts · no final exam · credential + CE follow. Copy
  card; collapsible after first dismissal.

## 2. RESUME WITH MEMORY (P24, P13 polish)
- Returner hero copy: "Welcome back — you stopped 12:42 into
  Module 6: <lesson title>." Resume button + "Replay last 30s"
  (seeks back 30 within watched region — no policy change).

## 3. QUIZ MOMENT COPY (P30/P31/P35)
- Result leads with "Passed — 8/10" or "Not yet — 6/10 · 7/10
  required"; fail state's only primary actions: Review lessons ·
  Retry quiz; pass state gets restrained celebration + the P39
  bridge (below). Per-topic feedback (P32) is OUT — needs question→
  topic metadata; content-load ledger item.

## 4. CHAPTER-TRANSITION BRIDGE (P39)
- After every quiz pass: next module's title, one-line why-it-
  matters (authorable field: lms_modules.bridge_copy text null —
  the one migration this session), time estimate, Start button +
  Save-and-exit. Placeholder bridge copy in seed; real copy at
  content load.

## 5. COMPLETION MOMENT (P43/P44-lite/P45)
- On course completion: a completion screen — checklist (N/N
  modules, N/N quizzes, date, learner name) → credential reveal →
  "My Credentials" becomes a persistent nav destination housing the
  interim certificate + designation status. The CE rows of the P44
  cascade join this screen when R1 lands (build the slots; render
  only when data exists).

## 6. PLAYER CHECKLIST (P14)
- Collapsible module lesson-checklist in the lesson view ("Module 5
  of 14" + per-lesson ticks) — orientation without leaving the
  player.

## 7. LOCK COPY POLISH (P09)
- Locked module copy names the blocking step and links to it
  ("Complete Module 4's quiz to unlock" → button to that quiz).

## 8. EXPLICITLY OUT (assigned elsewhere)
Reminder ladder P52 → W1 (existing renewal-comms functions);
CE cascade rows / confirmed-after-posting P44/P51 → R1 (+ a
"confirmed" toggle on report runs as an R1 rider); captions P15 +
transcripts P16 → S1/content load (caption files are a content
requirement — added to the content checklist); per-topic quiz
feedback P32 → content-load metadata; targeted inactivity emails
P25 → promotion-era comms; everything tagged FYI → the drawer.

## 9. GATE
Standard three legs. Evidence: each numbered item shown rendered
(screenshots or preview walkthrough description); the one migration
(bridge_copy) + its admin edit field; completion-screen walkthrough
on fptcomplete synthetic; suite green with justified updates;
branch + hash.
