# LMS promotion inputs

Promotion is a separate, explicitly approved operation. The LMS migration set
does not infer production course identity from sandbox content.

## CFP Board program IDs

Before promotion, confirm the production course slugs and apply the reviewed
slug-to-program-ID mapping as environment-specific content DML. The mapping
currently expected by the product is:

| Production course slug | CFP Board program ID |
| --- | --- |
| `financial-professional-track` | `312442` |
| `custody-security` | `332761` |
| `spot-ethereum-etfs` | `328447` |
| `nfts` | `321877` |
| `defi-daos` | `321876` |
| `staking-lending-borrowing` | `321875` |
| `genius-act` | `339638` |
| Renewal course slugs | Supply the registered program ID for each year |

The slug-matching `UPDATE` in
`20260727160000_r1_ce_reporting.sql` is sandbox-content DML. It is not a
production mapping mechanism. After the production mapping is applied, run:

```sql
select public.lms_assert_ce_reportable();
```

Promotion must stop if the assertion lists any published CE-bearing course.

## Edge-function origins

Set `LMS_ALLOWED_ORIGINS` as a comma-separated secret containing every approved
learner/admin web origin. Do not include `*`. Confirm an approved origin is
echoed and an unlisted origin receives no `Access-Control-Allow-Origin` header
before promotion proceeds.

## Seed exclusion

`supabase/config.toml` keeps automatic seeding disabled. `supabase/seed.sql` is
synthetic-only and aborts when any existing Auth user lacks an `@example.` email
shape. Do not run the seed command during promotion.
