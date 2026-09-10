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
6. `W05-C06 EXACT_GREGORIAN_DUE_DATES`: replace the 365/30-day approximation in `add_days_iso`. Due dates must use exact Gregorian calendar-day arithmetic across month ends, year ends, and leap years; invalid source dates must be rejected. Add executable Rust boundary tests (including 2028-02-28 + 1/2 days and month/year rollover).
7. `W05-C07 SOURCE_SPECIFIC_PAYMENT_TERMS`: supplier invoices and purchase orders must use the approved payment terms of their own supplier/PO/contract authority. Never apply the first subcontract contract's terms to every supplier. Missing or ambiguous supplier authority must return `Requires setup` with the source id.
8. `W05-C08 NO_SILENT_FINANCIAL_FALLBACKS`: required source amounts, dates, types, and settlement fields must not silently become zero, `Client`, or the Data Date. Reject or expose a governed Data Quality exception; malformed facts must not enter forecast buckets.
9. `W05-C09 FRESH_DELIVERY_EVIDENCE`: regenerate `W05_EVIDENCE.json` after the final code and dependency lock are complete. It must contain the actual final hashes and local Cargo/Node/build results; stale pre-correction evidence is invalid.

The open sequential queue must remain on W05 until these items pass the delivery gate;
W06 must not start yet. Codex local verification of candidate `96916e9` passed 8 targeted
Rust tests and 279 Node tests, lint and build, but those green tests do not cover C06-C09.
The candidate also removed `framer-motion` from `package-lock.json` while retaining it in
`package.json`; restore lock consistency without changing declared dependencies.
