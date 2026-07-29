# Local production-scale data

This lane generates a deterministic, sanitized dataset for local QA. It does not connect to Supabase, import rows, create passwords, or change application wiring. Generated artifacts live in `qa/generated/` and are gitignored.

Run:

```sh
npm run qa:data
```

`qa:data:generate` writes table-shaped NDJSON and a manifest. `qa:data:verify` independently checks every file's SHA-256, exact row count, primary/foreign-key relationships, course policy invariants, role metadata, and the identity allowlist. A non-`example.test` identity is a hard failure.

## Fixed scale

- 10,000 synthetic learners and 2 synthetic operators (no passwords)
- 6 courses: FPT, Bonus, and Renewal 2024–2027
- 24 modules: 14 FPT, 6 Bonus, and one per renewal year
- 62 lessons, 24 resources, 18 quizzes, and 180 questions
- 27,000 enrollments across active, expired, and revoked access
- 161,500 lesson-progress rows, 75,500 quiz attempts, and 2,500 completion events
- 1,000 audited admin actions

The catalog deliberately crosses the learner and admin workflow shapes while keeping quiz policy fixed at 10 questions and 70%. Persona bands cover terms-pending, in-progress, repeated quiz failure, almost complete, FPT complete, fully complete, expired, revoked, and auth-only/empty states.

## Safety and reproducibility

All identities are generated as `qa-learner-NNNNN@example.test` or `qa-operator-NNNNNN@example.test`; display names, credential IDs, copy, order IDs, and content are synthetic. IDs are stable UUIDs derived from a fixed namespace, timestamps are anchored to a fixed QA epoch, and each NDJSON file ends with exactly one newline. Re-running generation produces identical hashes.

These files are inert fixtures. A future local importer must refuse non-loopback database URLs, require an explicit destructive-reset acknowledgement, and consume only a freshly verified manifest. It must never accept a hosted project URL or a service-role key from a committed file.

The canonical `supabase/seed.sql` remains the small six-person contract fixture. Its placeholder paths are the final paths recognized by the playback and resource edge functions so a fresh migrations-then-seed reset does not recreate stale pre-D3/pre-D6 references.
