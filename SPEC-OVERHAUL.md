# DACFP-LMS — O-SERIES OVERHAUL CONTRACT (design pass, behavior-frozen)

STATUS: Standing addendum. Commit to the repo root as SPEC-OVERHAUL.md.
SPEC.md v3.1 remains the governing contract; Hard Rules 1–12 apply.
Sessions in this series run in CLAUDE CODE (Opus), not Codex — the
workflow is unchanged: one session, one branch, gate evidence, merge
only on Jack's explicit "merge approved" after drift verification and
Jack's visual QA. End every response with the standing attestation
line; for this entire series it must read [SUPABASE: NONE | calls: 0].

## 0. THE FREEZE (non-negotiable, every O session)

1. NO changes to: src/engine/*, src/data/provider.ts interface,
   supabase/functions/*, supabase/migrations/*, supabase/seed.sql,
   any RPC, any auth flow logic, any data-fetching sequence or
   dependency. Zero Supabase MCP calls; zero deploys.
2. Provider implementations may be touched ONLY to relocate
   presentation-shaped mapping; any diff there must be justified
   line-by-line in the gate evidence.
3. Business copy is frozen where load-bearing: the access-vs-
   designation separation sentence, the published exam policy wording
   (10 questions / 70% / unlimited / no final exam), and generic
   denial messages must survive verbatim (restyled, not reworded).
4. If any design goal appears to require server or logic change, STOP
   and flag. (Known example already handled: select_kind shipped in
   F2. There should be no others.)
5. Tests: the full suite must pass every session. Test changes are
   allowed ONLY where they assert markup/roles that legitimately
   changed; each such change listed and justified in evidence.
6. Scope discipline: this contract + Fable's UI Overhaul Brief Inputs
   (items 1–22) + Jack's IA decisions (§2) are the whole brief.
   Hard Rule 11 applies to design too — tailored, not a design system
   for its own sake.

## 1. FOUNDATION MANDATE — shadcn/ui (session O1)

- `npx shadcn@latest init` against the existing Vite + React 19 +
  Tailwind v4 stack (fully supported; CSS-variable theming).
- PRIMITIVE ALLOWLIST — add these and ONLY these (additions require a
  flagged justification in evidence): button, card, dialog,
  alert, badge, radio-group, checkbox, label, progress, tabs, table,
  input, select, textarea, sheet, separator, sonner (toasts),
  skeleton, dropdown-menu, alert-dialog (destructive confirms).
- TOKEN MAPPING: DACFP palette wired into the shadcn CSS variables.
  Contrast fixes from the audit are REQUIRED at this layer:
  dacfp-mist darkened to ≥4.5:1 for any text use; brand-gold
  restricted to dark surfaces (or darkened variant for light);
  document allowed backgrounds per token in a comment block in the
  CSS. Eyebrow tracking, gradient strip, grid widths, icon sizes
  tokenized (brief inputs #20).
- COMPONENT EXTRACTION onto shadcn bases (brief #19): Alert (3+
  copies → shadcn alert), LockedBadge (4 copies → badge variant with
  lock-reason via aria-describedby, brief #14), IconTile (one
  component, size prop), Field/FormLabel (label + slot pattern).
- Accessibility infrastructure lands here: TermsModal → shadcn/Radix
  dialog (focus trap, initial focus, inert background, scroll lock —
  brief #10); route-change focus to #main-content (#11); login mode
  switcher → real tabs or plain buttons (#12); quiz verdict live
  region + focus-to-result plumbing built as a reusable
  StatusAnnouncer (#3, consumed in O2).
- Code-splitting (M-12): React.lazy the /admin subtree; learner
  bundle measurably smaller — before/after sizes in evidence.
- O1 GATE: drift check (diff confined to presentation + allowed
  files); token contrast table with computed ratios; bundle
  before/after; suite green; Vercel preview; Jack visual spot-check
  that the foundation "reads DACFP".

## 2. LEARNER EXPERIENCE (session O2) — includes Jack's IA

- DASHBOARD IA (Jack's decisions, visual layer now, entitlement
  wiring stays promotion-scope):
  a. FPT is the hero — primary card/section, resume-first.
  b. Renewal renders as an EVENT surface, not a permanent peer card —
     styled as a distinct, time-bound call-to-action region; in the
     dark build it may show whenever a renewal enrollment exists, but
     the component must accept a visibility/window prop so promotion
     wiring is a prop change, not a redesign.
  c. Bonus modules live in their own "library" section, visually
     subordinate to FPT, locked-state storytelling per brief #14.
- QUIZ STEPPER (brief #1–#5): one question per screen, "Question N of
  10" progress, persisted answers per step, review screen before
  submit, radio/checkbox per select_kind (F2 groundwork), ≥20px
  controls with full-row selection treatment, sticky mobile submit,
  verdict announced via StatusAnnouncer with focus moved to result,
  attempt history using possible-points denominator (already fixed in
  F2 — keep it).
- PLAYER CHROME (brief #6–#9 visual halves): mm:ss everywhere via one
  shared formatter (#7); progress-save failure surfaced via the F2
  banner pattern styled properly (#9); no src-swap concerns remain
  (F1/F2) — chrome only.
- STATES & COPY (brief #15–#17): "No access expiry" branch; markdown
  rendering for readings via a SANITIZED renderer (react-markdown +
  rehype-sanitize or equivalent; no raw HTML pass-through — flag the
  dependency addition in evidence); skeletons for boot and page
  loads; sandbox/dark-build vocabulary behind one env-flag component
  (#17); mobile header compressed to one row + overflow (#13);
  ?learner= plumbing and listLearners removed from the learner app
  (M-10 — interface removal touches provider.ts: justify per Freeze
  rule 2).
- O2 GATE: drift check; full-page visual QA by Jack on the preview,
  phone-first, including the quiz stepper end-to-end with a
  deliberate fail; screen-reader smoke of the quiz verdict; suite
  green with justified test updates.

## 3. ADMIN EXPERIENCE (session O3)

- Brief #21 in full: key-value inspector views replacing JSON <pre>
  dumps; card-per-row audit table below md; drag confined to a grip
  handle (touch fallback retained); alert-dialog replacing
  window.confirm for destructive actions; labeled file inputs and
  properly named radio groups (L-12 items); session-expiry surfaces a
  re-auth prompt (L-11) using existing isLmsAccessDenied — UI only.
- Admin adopts the same shadcn foundation; pass_pct remains rendered
  read-only with the published-policy note (Hard Rule 12 display).
- O3 GATE: drift check; Jack admin walkthrough on phone AND desktop
  including one destructive confirm and one forced failure banner;
  suite green.

## 4. OUT OF SCOPE (unchanged assignments)

Promotion spec: entitlement wiring for the renewal surface, real
content/Stream, CE reporting, auth Admin API, CORS pinning,
leaked-password toggle, CI pipeline, real answer keys, repo→private
flip. Ledger (post-overhaul backlog): pre/post surveys, Investor
Track decision, sponsor portal, white-label theming hooks.

## 5. VERIFICATION PROTOCOL

Per session: Opus evidence → Claude drift verification (mechanical
diff-scope proof: every changed file classified presentation/allowed/
violation; any violation fails the gate) + suite re-run → Jack's
visual QA on the Vercel preview → "merge approved". Fable's audit
findings remain the reference: each brief input claimed as done must
cite where.
