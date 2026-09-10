# Codex W05 Review — 2026-09-10

## Decision

`LOCALLY_VERIFIED_CANDIDATE_WITH_CORRECTION_BACKLOG` — not yet closed at 8/10.

The preferred candidate is the implementation on Agent Cloud `main` at
`ca43df5a0945643f966b233c58cd897af0edba18`. Do not replace it with the divergent
Arena implementation at `89cffb0`: that branch fails Cargo compilation, creates a
second incompatible `cash_forecast_versions` schema, and deletes the stronger W05
governance test suite.

## Verified evidence

- `npm ci --ignore-scripts`: passed after regenerating the dependency lock.
- `npm test`: 274 passed, 0 failed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 56 passed, 0 failed, including 2 executable W05 Rust/SQLite tests.
- `git diff --check`: required before delivery.

## Mandatory W05 correction backlog

1. `W05-C01 PAYMENT_TERMS_AUTHORITY`: remove invented 60/30-day and percentage defaults. Missing governed contract/supplier terms must return `Requires setup`; caller/UI assumptions must not masquerade as approved master terms.
2. `W05-C02 REOPEN_IDEMPOTENCY`: persist and replay `ReopenCashForecastVersionRequest.operation_id`; a retry must return the same draft and must not fail or create another revision.
3. `W05-C03 SNAPSHOT_STATUS_CONSISTENCY`: when an older Approved version becomes Superseded, update its immutable snapshot through the governed transaction so `get/list` cannot display two Approved versions.
4. `W05-C04 APPROVAL_TIMESTAMP`: validate and persist the supplied approval date or remove it from the API; it must not be accepted and silently ignored.
5. `W05-C05 EXECUTABLE_NEGATIVE_TESTS`: add Rust tests for missing payment terms, reopen replay, late transactional rollback, status/snapshot consistency, and locked-period mutation.

The open sequential queue may proceed to W06 without waiting for Codex, but these
items remain mandatory before W05 can be rated or reported as 8/10.
