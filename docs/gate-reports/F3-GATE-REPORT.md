# Session F3 — Production-Blocker Remediation Gate Report

`[SUPABASE: xfvaohvismisfdggfdfj | calls: 29]`

F3 gate reached on `codex/f3-blockers`. No merge was performed. This report is
implementation evidence for independent review; it is not independent
verification.

## 1. Migration SQL in full

The complete, unabridged SQL is committed in these executable migration
artifacts:

- [`supabase/migrations/20260727190000_f3_production_blockers.sql`](../../supabase/migrations/20260727190000_f3_production_blockers.sql)
- [`supabase/migrations/20260727190100_f3_grant_enrollment_conflict_rider.sql`](../../supabase/migrations/20260727190100_f3_grant_enrollment_conflict_rider.sql)

Both migrations were applied through the sandbox MCP migration operation. The
second migration reapplies the repository's established explicit conflict-target
repair after F3 replaces `lms_grant_enrollment`.

## 2. Scoped auth-trigger proof

One rolled-back SQL fixture exercised all three cases:

```text
case                 lms_role   profile_created   other_role_preserved
existing lms_role    operator   true              n/a
marked               learner    true              n/a
unmarked             null       false             command-center-operator
```

The unmarked insert received neither an LMS claim nor a learner profile. The
marked insert received `lms_role=learner` and a profile. An existing
`lms_role=operator` value was not overwritten.

## 3. Survey direct-insert denial

An explicit authenticated-role insert, inside a rolled-back transaction, failed
as required:

```text
ERROR: 42501: permission denied for table lms_survey_responses
```

Final-state inspection also showed no authenticated INSERT grant and no
`lms_survey_responses_insert_own` policy.

## 4. CE preview/export binding

Rolled-back synthetic fixtures proved:

```text
preview_count=1
frozen_count=1
previewed_set_equals_frozen_set=true
```

Changing the candidate set after preview and before run creation failed loudly:

```text
SQLSTATE 22023: no reportable completions
```

The preview's excluded bucket returned these reasons:

```json
["blank-name", "no-program-id", "non-string-cfp"]
```

That includes both the required blank-name and numeric-CFP synthetic cases. Run
creation accepts the previewed `completion_id[]`, compares it with the live
candidate set, and freezes only that exact set. The edge function maps SQLSTATE
`22023` to HTTP 400 `InvalidRequest`.

## 5. Learner-profile validation proof

Each negative fixture was rejected with SQLSTATE `23514`:

```text
bad firm_url             lms_learner_profiles_firm_url_http
numeric credential value lms_learner_profiles_credential_ids_values
over-length text          lms_learner_profiles_display_name_length
oversized address jsonb   lms_learner_profiles_address_size
oversized credential json lms_learner_profiles_credential_ids_size
```

Authenticated update privilege on `updated_at` was false. Client inputs use
matching maximum lengths.

## 6. Function-config coverage

`src/data/f3SecurityConfig.test.ts` discovers every directory under
`supabase/functions/` and requires a matching `config.toml` block with
`verify_jwt = true`. The repository suite passed with all seven function
directories covered.

Sandbox deployment inspection reported all seven functions ACTIVE with JWT
verification enabled.

## 7. CORS allowlist proof

The sandbox allowlist was set to the stable application aliases plus local
development. Live OPTIONS requests against the deployed function returned:

```text
allowed origin: status=200, access-control-allow-origin=<same allowed origin>
foreign origin: status=200, access-control-allow-origin=null
vary: Accept-Encoding, Origin
```

All seven functions share the same request-aware allowlist implementation;
preflight, success, and error paths use it. No wildcard remains.

## 8. CFP program-ID assertion

Calling `lms_assert_ce_reportable()` against current sandbox content raised
SQLSTATE `22023` and listed the two published renewal-course slugs whose
`cfp_program_id` is null. The required production slug/program-ID mapping is
recorded as a promotion input in
[`docs/PROMOTION-INPUTS.md`](../PROMOTION-INPUTS.md); no values were invented.

## 9. Seed guard proof

Inside a transaction, a simulated non-synthetic auth user was inserted and the
opening seed guard raised:

```text
SQLSTATE P0001: seed refused: non-synthetic users present
```

The transaction was rolled back, and a follow-up check found zero residual gate
rows. Automatic database seeding is disabled in `config.toml`.

## 10. Learner quiz response proof

A disposable authenticated learner with FPT access called the deployed
`lms-get-quiz` function:

```text
auth_ok=true
function_error=null
question_count=10
contains_correct=false
response_keys=["questions", "quiz"]
```

The disposable auth user, profile, and enrollment were deleted. Final-state
checks found zero residual trigger, quiz, or seed gate rows.

## 11. Final local gates

```text
npm test: 25 files passed, 202 tests passed
npm run lint: passed
npm run build: passed
git diff --check: passed
forbidden-reference whole-tree scan: 0 matches
```

The build emitted only the existing large-chunk advisory. The branch is stopped
at the F3 gate pending independent review and explicit merge approval.
