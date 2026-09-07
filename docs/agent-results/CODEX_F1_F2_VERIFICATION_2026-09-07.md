# Codex verification — F1/F2 agent-cloud drafts

Date: 2026-09-07  
Reviewed base: `441f280`  
Agent commits: `6b70fb0`, `fce8482`  
Decision: preserve useful implementation, repair before acceptance.

## Scope identity

The two new commits are **F1 Labor Timesheets** and **F2 Equipment Logs**, not E1/E2.
E1 and E2 were already accepted before this base. F1 remains the active gate; F2 is
staged code and cannot be accepted or advanced to F3 before F1 closes.

## F1 evidence

### ACCEPT

- SQLite header/line entities and foreign keys exist in migration 61.
- TypeScript types, Data Dictionary registration, repository loading and `useData`
  state exist.
- Rust validation checks essential scope, active Labor resource, duplicate worker/
  date/shift, non-negative hours and locked work date.
- Posting derives labor amounts and creates Control Account-linked Cost Entries.
- Reversal creates offset entries without deleting the original.

### REPAIR before 8/10

- `src/App.tsx` exposes only a generic table. It neither imports nor invokes F1
  approve/post/reverse functions; there is no governed line-entry workflow.
- No Submit command exists. Approve accepts Draft and Post accepts Draft/Submitted,
  so the required `Draft → Submitted → Approved → Posted → Reversed` chain is bypassed.
- Generic repository writes are not blocked from setting governed F1 statuses.
- Header update immutability/transition SQL guards and same-transaction audit are absent.
- Post uses `ON CONFLICT ... DO UPDATE`, which can rewrite a prior financial fact rather
  than proving exactly-once immutable posting.
- Reversal uses original work date in the cost payload and has no locked reversal-date
  validation; this can rewrite the economic effect into a closed period.
- Backend does not prove main-contract scope, activity↔Control Account association,
  cost-code↔Control Account association, total shift capacity, or governed non-working
  calendar override.
- Existing tests validate helpers/source text but do not execute F1 Rust transactions,
  atomic rollback, reopen persistence, audit, or ledger reconciliation.

Current verified rating: **4/10 — PARTIAL, not accepted**.

## F2 evidence

### ACCEPT

- SQLite entity, TypeScript/data mappings, UI table registration, validation helper
  and atomic Rust command skeletons exist.
- Meter rollback/overlap, non-negative values, active equipment resource and locked
  log date receive initial validation.
- Equipment and fuel are separated into Cost Entries; reversal entries are preserved.
- The agent Rust compile defect in reversal lock lookup was corrected during review.

### REPAIR before 8/10

- No production workflow action invokes F2 approve/post/reverse; Submit is absent.
- Approve/Post bypass lifecycle stages, and generic CRUD can mutate governed status.
- Only delete is guarded in migration 62; governed header update immutability and
  legal transition triggers are absent.
- No same-transaction audit evidence; `INSERT OR REPLACE` can overwrite existing
  financial facts instead of immutable exactly-once posting.
- Main-contract, activity↔Control Account, cost-code and calendar/shift capacity
  relationships are not fully proved by backend validation.
- Tests do not execute transaction rollback, audit/reopen or ledger reconciliation.

Current verified rating: **4/10 — PARTIAL, staged behind F1**.

## Baseline test evidence

- Node acceptance: `203/203 PASS` after running outside the Windows sandbox (the first
  in-sandbox attempt failed before tests with `spawn EPERM`, not a product failure).
- Production build: Vite/TypeScript PASS.
- Rust before repair: FAIL at `equipment_log.rs` reversal-period `fetch_one` because
  an owned `SqliteTransaction` was dereferenced twice.
- Rust after repair: `27/27 PASS`; three non-fatal dead-code warnings remain in the
  new modules and should be removed during F1/F2 repair.

These passing suites prove no current regression, but they do **not** prove the missing
workflow and transaction acceptance criteria listed above.

The required local Ollama read-only gate was run against only this report, the new
read-pack authority, the universal prompt and its contract test. The local model
returned a generic refusal instead of a technical verdict; the artifact is saved under
`tmp/ollama-reviews/20260907-064707-F1-F2_verification_and_token-bounded_work_orders.md`.
Therefore the independent gate is **INCONCLUSIVE**, not falsely reported as PASS;
Codex's file evidence and executable gates above remain the review basis.

## Exact continuation order

1. Finish F1 only using the F1 Read Pack: Submit command, strict transitions, UI header+
   lines/actions, SQL guards, audit, main-contract/calendar/scope validation, immutable
   idempotent post/reverse, executable transaction/reopen/reconciliation tests.
2. Run Node/build/Cargo/diff and independent Ollama review; Codex alone scores F1.
3. Only after F1 reaches 8/10, finish F2 with the equivalent controls and tests.
4. Do not start F3 while either active gate is incomplete.

## Repository hygiene correction

The agent changed `package-lock.json` as if npm dependencies differed and added
`bun.lock` plus `metadata.json` without product need. The canonical npm lockfile was
restored from the accepted base and the two unrequested artifacts were removed. No
tracked product file, migration, test, or user data was deleted.
