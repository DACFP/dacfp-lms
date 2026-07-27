# CBDA Course Surveys — Question Structure Spec

Source: Absorb "Answers" exports `20260725T0158` (pre-course) and `20260725T0159` (post-course), generated 2026-07-25.
Contents: question structure only. No respondent data, names, or answer rows. Counts shown are aggregate respondent tallies used solely to infer branching and required/optional status.

**Two caveats on fidelity, up front:**

1. **Question order is inferred, not exported.** Absorb's Answers export does not carry question position. Order below is reconstructed from mean within-person answer-timestamp rank, which is clean and unambiguous for these dumps — but confirm against the Absorb authoring UI before treating it as canonical.
2. **Option order within a question is NOT recoverable from this export.** Option *text* below is verbatim and complete (every option observed anywhere in the data). Option *order* is presented in natural ordinal order for banded/scale questions and alphabetically otherwise. Confirm original display order in Absorb authoring if it matters.

Verbatim text preserves source typos, marked `[sic]`. Fix at rebuild; see Restructuring Notes.

---

## Survey 1 — Pre-Course Survey (export 0158)

818 respondents · 10,437 answer rows · 15 exported question records.

### ⚠ Inferred hidden gate question (not present in export)

The export contains **no explicit "Do you personally own crypto?" question**, yet the branch structure requires one:

- "Where did you purchase…" (361 respondents) and "No, because:" (321 respondents) are **near-disjoint** (overlap of 4, attributable to retakes) — a Yes/No routing point must exist between Q7 and Q8.
- The orphaned free-text record "Other:" (18 respondents) co-occurs with **neither** branch (0 overlap with purchase, "No, because:", or the stocks/funds question), and its timestamp rank places it exactly at the gate position — consistent with the gate offering a third **"Other (specify)"** path whose spillover text Absorb exported as a standalone "question."
- 140 respondents answered neither branch; 79 of those still answered "Which Crypto Stocks and Funds?" — suggesting either a second gate ("Do you own crypto stocks or funds?") or that the stocks/funds question was open to all with heavy skipping. The stocks/funds question is answered by essentially zero "No, because:" respondents (1 of 321), which favors the second-gate reading.

**Action:** recover the exact gate question text and options from the Absorb authoring UI; do not invent wording. The rebuild must make this gate an explicit question with explicit routing.

### Question list (inferred display order)

**1. What type of firm do you work for?**
- Type: single_choice
- Options (13, alphabetical — original order unknown): `Accounting` · `Bank` · `Broker/Dealer` · `Consulting` · `Education` · `Family Office` · `Fund Manager` · `Government` · `Insurance` · `Law` · `Other` · `RIA` · `SMA/TAMP`
- Branching: none. Its `Other` option does **not** trigger the "Other:" free-text record (near-zero co-occurrence) and currently captures no specification text.
- Required/optional: answered by 818/818 — the only question with full coverage; effectively required (or at minimum first and unskipped).

**2. What is your position?**
- Type: single_choice
- Options (5, alphabetical): `Executive, Partner or Owner` · `Legal/Compliance` · `Management` · `Operations/Trading` · `Sales/Marketing`
- Branching: none.
- Required/optional: 815/818 (0.4% skip) — effectively required.

**3. What is your firm's AUM?**
- Type: single_choice, banded ordinal scale (7 bands)
- Options in ascending order: `Under $50 million` · `$50 million to $99 million` · `$100 million to $499 million` · `$500 million to $999 million` · `$1 billion to $4.99 billion` · `$5 billion to $9.99 billion` · `$10 billion+`
- Branching: none.
- Required/optional: 809/818 (1.1% skip).

**4. How many advisors/rep are employed by or associated with your firm?** *("advisors/rep" [sic] — singular)*
- Type: single_choice, banded ordinal scale (8 bands)
- Options in ascending order: `Less than 5` · `5-9` · `10-24` · `25-49` · `50-99` · `100-499` · `500-999` · `1,000+`
- Branching: none.
- Required/optional: 806/818 (1.5% skip).

**5. How many clients does your firm serve?**
- Type: single_choice, banded ordinal scale (5 bands)
- Options in ascending order: `Less than 500` · `500-9,999` · `10,000-99,999` · `100,00-999,999` *[sic — missing digit; should read 100,000-999,999]* · `1 million+`
- Branching: none.
- Required/optional: 803/818 (1.8% skip).

**6. Does your firm invest in crypto?**
- Type: single_choice
- Options: `Yes` · `No`
- Branching: none detected.
- Required/optional: 802/818 (2.0% skip).

**7. Does your firm permit its advisors/reps to recommend crypto to clients?**
- Type: single_choice
- Options: `Yes` · `No`
- Branching: none detected.
- Required/optional: 802/818 (2.0% skip).

**— [inferred hidden gate: personal crypto ownership — see box above] —**

**8a. Where did you purchase your crypto? (check all that apply)** *(owner branch)*
- Type: multi_choice
- Options (6, alphabetical): `401(k) provider (Fidelity, 4UsAll)` · `A CeFi crypto exchange (Coinbase, Gemini, Kraken, etc.)` · `A DeFi crypto platform (MetaMask, etc.)` · `NFT marketplace (Opensea, etc.)` · `PayPal or similar platform` · `Qualified IRA custodian (Choice, Price Trust, etc.)`
- Branching: appears only for respondents on the "owns crypto" path of the hidden gate (361 respondents; overlap with the non-owner branch = 4, retake artifacts).
- Required/optional: within-branch coverage appears complete (its sibling Q9 has 359, i.e. essentially everyone on this path answers both).

**8b. No, because: (check all that apply)** *(non-owner branch)*
- Type: multi_choice
- Options (8, alphabetical): `I don't own any investments` · `I don't undertand it enough` *[sic — "understand"]* · `My firm prohibits it` · `Not enough regulatory clarity` · `Other (specify)` · `Prices are too high` · `Too much fraud` · `Too risky`
- Branching: appears only for respondents on the "does not own crypto" path of the hidden gate (321 respondents). **Note:** its `Other (specify)` option (25 selections) does **not** feed the exported "Other:" free-text record (0 overlap) — the specify text for this option was either not collected or not exported.
- Required/optional: within-branch, effectively required.

**8c. Other:** *(orphaned free-text — parent is the hidden gate)*
- Type: text
- Branching: all 18 respondents answered neither 8a nor 8b nor Q10 — consistent with an `Other (specify)` option on the hidden gate itself. Parent attribution must be confirmed in Absorb authoring.
- Required/optional: n/a (branch spillover).
- **RETIRE:** orphaned artifact. In the rebuild, attach specification text to the specific triggering option (option-level `free_text` slot), never as a standalone question.

**9. Where do you store your crypto? (check all that apply)** *(owner branch)*
- Type: multi_choice
- Options (3): `In a hot wallet held for me at an online exchange or platform` · `In a cold wallet held for me at an online exchange or platform` · `In a cold wallet I manage myself (Ledger, Trezor, etc.)`
- Branching: owner branch; its 359 respondents are a strict subset of Q8a's 361.
- Required/optional: within-branch, effectively required.

**10. Which Crypto Stocks and Funds? (check all that apply)**
- Type: multi_choice
- Options (12, alphabetical): `401(k) account holding crypto` · `Bitcoin futures ETFs` · `Bitcoin or Ethereum ETFs (available outside U.S.)` · `Bitcoin short futures ETFs` · `Crypto ETFs (stock funds holding shares of companies in the crypto industry)` · `Crypto Proxy stocks (MicroStrategy, etc.)` · `Crypto SMA or TAMP (Eaglebrooke, etc.)` *[likely "Eaglebrook"]* · `Crypto stocks (Coinbase, Silvergate, etc.)` · `Grantor Trusts bought OTC via a brokerage account` · `Grantor Trusts bought at NAV from the sponsor (such as Grayscale, Bitwise, Osprey)` · `IRA account hodling crypto` *[sic — "holding"]* · `VC/PE/Hedge fund investing in crypto`
- Branching: ambiguous in export. 297 respondents: 218 from the owner branch, 1 from the non-owner branch, 79 from neither. Most consistent with a separate gate ("Do you own crypto stocks or funds?") whose Yes routes here — coin non-owners can still hold MSTR or an ETF. Confirm in Absorb authoring.
- Required/optional: cannot be inferred until its gate is confirmed.

**11. What is your age?**
- Type: single_choice, banded ordinal scale (5 bands + decline)
- Options in ascending order: `18-24` · `25-35` · `36-46` · `47-60` · `60+` · `Prefer not to say`
- Branching: none.
- Required/optional: 798/818 (2.4% skip) — answered by respondents who skipped mid-survey branches, so it is asked of everyone.

**12. What is your gender?**
- Type: single_choice
- Options: `Male` · `Female` · `Non-binary` · `Other` · `Prefer not to say`
- Branching: none. Its `Other` option does not feed any free-text record.
- Required/optional: 798/818 (2.4% skip).

**13. Which race or ethnicity best describes you? (Please chose only one)** *[sic — "choose"]*
- Type: single_choice
- Options (8, alphabetical): `American Indian or Alaskan Native` · `Asian / Pacific Islander` · `Black or African American` · `Hispanic` · `Multiple ethnicity` · `Other` · `Prefer not to say` · `White / Caucasian`
- Branching: none. `Other` captures no specification text.
- Required/optional: 797/818 (2.6% skip).

---

## Survey 2 — Post-Course Survey (export 0159)

681 respondents · 2,057 answer rows · 4 exported question records.

### ⚠ Inferred hidden gate question (not present in export)

The allocation question (Q1 below) was answered by only 185 of 681 respondents (27%), yet **for those who answered it, it was almost always their first answer** (mean within-person timestamp rank 1.12) — it sits at the top of the survey behind a condition. Cross-referencing pre-course data: of its answerers matched to pre-course, 139 were pre-course *non-owners* vs. 8 pre-course owners. The question's future tense ("will you allocate") fits the same reading: it is shown to people who indicated — on an unexported gate such as "Now that you've completed the course, will you invest in crypto?" — that they intend to start. Recover exact gate wording from Absorb authoring.

### Question list (inferred display order)

**1. How much of your portfolio will you allocate to crypto?**
- Type: single_choice, banded ordinal scale (8 bands)
- Options in ascending order: `Less than 1%` · `1% to 1.9%` · `2% to 2.9%` · `3% to 4.9%` · `5% to 9.9%` · `10% to 14.9%` · `15% to 19.9%` · `20% or more`
- Branching: conditional on the inferred hidden gate above (185/681 answered; skew toward pre-course non-owners is decisive).
- Required/optional: within-branch, appears required.

**2. Do you want your firm to allow its advisors/reps to recommend crypto to clients?**
- Type: single_choice
- Options: `Yes` · `No` · `Unsure/No opinion`
- Branching: none.
- Required/optional: 680/681 — effectively required.

**3. Would you be willing to introduce DACFP to your employer's management so we can offer the Certificate course to others in the organization?**
- Type: single_choice
- Options: `Yes` · `No`
- Branching: none; acts as the parent of Q4.
- Required/optional: 679/681 — effectively required.

**4. Thank You! Please provide your name/contact info below**
- Type: text
- Branching: **triggered by Q3 = `Yes`.** All 424 respondents to this field are in the Q3-Yes population (the 9 who also appear in Q3-No are retake artifacts — people who answered twice and changed their Q3 answer). Within the eligible branch, ~93% completed it.
- Required/optional: within-branch, near-required (or strongly prompted).
- **RETIRE:** the new platform authenticates the learner; identity and contact data already exist on the account. Replace with a structured consent boolean (e.g., "May DACFP contact you about offering the course at your firm?" Yes/No), which also removes free-text PII collection from the survey layer entirely.

---

## Restructuring Notes — Absorb artifacts vs. intent

Things visible in this export that are format workarounds, not survey design. Do not carry them into the rebuild as requirements.

1. **The `Correct` column is meaningless noise.** Absorb forces every question into a quiz mold and arbitrarily marks one survey option "correct" (inconsistently between the two surveys, even for equivalent Yes answers). Surveys in the new platform must be a distinct assessment kind with no correctness or scoring semantics at all.
2. **Long-format multi-rows are an export shape, not a data model mandate.** Multi-choice answers arrive as one row per selected option sharing a single timestamp. Storing responses long (one row per person-question-option) remains the right call — but as a deliberate schema choice with proper keys, not because the export looked that way. Reporting pivots belong in views.
3. **Branching exists only as human-readable label conventions.** "No, because:" encodes its parentage in prose; the actual gate questions are absent from the export entirely; "Other:" floats as an orphan. The rebuild needs machine-readable structure: `parent_question_id` + triggering option(s) on every conditional question, and option-level free-text slots for every "Other (specify)"-style option (three of which currently collect nothing: firm type `Other`, gender `Other`, race `Other`, and "No, because:" `Other (specify)`). Correct denominators in reporting depend on this.
4. **Name-only identity is an export defect, not a keying strategy.** The dump identifies respondents solely by first/last name, with trailing-space and spelling drift. Every response in the new platform keys on the authenticated user id; names never serve as join keys.
5. **Retakes overwrite nothing and mean nothing structurally.** A small share of respondents answered questions multiple times months apart. Keep full response history; define the canonical answer once, centrally (latest per person per question), rather than per query.
6. **Question and option text must be versioned.** Several verbatim strings carry typos (`advisors/rep`, `100,00-999,999`, `undertand`, `chose`, `hodling`, `Eaglebrooke`). Fix them at rebuild — but as a new instrument version, with historical responses bound to the wording actually displayed, so longitudinal comparisons (e.g., the firm-adoption trend) stay valid.
7. **Free text is where PII leaks in.** The one open contact field accumulated names, emails, and phone numbers inside survey data. Design rule for the rebuild: survey responses contain no free-form identity data; anything identity-shaped lives on the account, and free-text fields are excluded from broad reporting views by default.
