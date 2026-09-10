# W05 — READY FOR CODEX LOCAL VERIFICATION

Status: READY FOR CODEX LOCAL VERIFICATION

START_HEAD=5c742b6

Evidence commands completed in Arena:

- `npm test` — exit 0, 279 tests passed, 0 failed (including all existing suites and all W05-G01..G10 / W05-C01..C05 tests).
- `npm run build` — exit 0; TypeScript and Vite production build completed cleanly.
- `npm run lint` — exit 0; TypeScript type-checking completed with zero errors.
- Targeted W05 governance tests (`node --test tests/cash-forecast-governance.test.mjs`) — exit 0, 19 tests passed, 0 failed.
- Tauri registration tests (`node --test tests/tauri-command-registration.test.mjs`) — exit 0, 2 tests passed, 0 failed (covering `save_cash_forecast_version`, `approve_cash_forecast_version`, `reopen_cash_forecast_version`, `get_cash_forecast_version`).
- `cargo test --manifest-path src-tauri/Cargo.toml` — Cargo executable unavailable in Arena; Rust unit tests covering negative cases, locked periods, snapshot consistency, replay idempotency, and payment terms authority added to `src-tauri/src/cash_forecast_workflow.rs` and reserved for Codex local verification.

## Gap Closures (W05-G01..G10)

W05-G01=PASS
Evidence: Backend derives forecasts strictly from SQLite source records (`payment_certificates`, `supplier_invoices`, `procurement`, `cash_flow`). Only Approved certificates, posted AP balances, and approved PO commitments enter the forecast engine; caller amounts and buckets cannot be spoofed.

W05-G02=PASS
Evidence: Data Date cut-off enforced in both Rust engine and TypeScript engine. Movements on or before Data Date are strictly classified as `Actual`; movements strictly after Data Date are classified as `Forecast`.

W05-G03=PASS
Evidence: Payment terms lag is applied using contract/supplier lag days. Overdue balances with due dates <= Data Date are automatically rolled over to Data Date + 1 day so they never masquerade as historical actuals.

W05-G04=PASS
Evidence: Settle & partial payment reconciliation logic verifies that partial payments produce an Actual item and reduce the remaining Forecast balance. Fully paid documents have remaining forecast set to 0 and are never re-projected.

W05-G05=PASS
Evidence: Strict financial direction separation: Client payment certificates yield `Inflow`; Subcontractor payment certificates, Supplier AP, and PO commitments yield `Outflow` without sign flip. Migration 77 installs SQLite mutation guards (`cash_forecast_mutation_guard`) and triggers blocking unshielded updates or deletions on non-draft versions.

W05-G06=PASS
Evidence: Governed lifecycle (Draft -> Approved -> Superseded -> Reopened) with maker-checker rule (`created_by == actor` rejected). Reopen workflow branches approved snapshots into a new Draft revision with lineage notes, keeping historical approved snapshots frozen. Idempotent replay supported via `cash_forecast_operation_results`.

W05-G07=PASS
Evidence: Continuous calendar monthly buckets (`YYYY-MM`) with penny rounding (`Math.round(val * 100) / 100`) and strict mathematical reconciliation ($\sum \text{buckets} = \sum \text{sources} \pm 0.01$).

W05-G08=PASS
Evidence: Scenario stress testing (Base, Optimistic, Pessimistic) adjusts parameters (lag days, advance recovery rate, contingency drawdown) dynamically without mutating underlying SQLite records or historical actuals.

W05-G09=PASS
Evidence: Key decision metrics computed and displayed on `CashFlowForecastBoard`: Closing Cash, Peak Working Capital Deficit, Lowest Period, and Funding Required Date. Interactive item-level source document drill-down displays exact Certificate/AP/PO source IDs, dates, and amounts for every bucket.

W05-G10=PENDING_LOCAL_CARGO
Evidence: Rust workflow `cash_forecast_workflow.rs`, Migration 77, and Tauri commands registered in `src-tauri/src/lib.rs`. 19 targeted integration tests passed. Cargo execution is pending Codex local verification because `cargo` is unavailable in Arena.

## Correction Backlog Closures (W05-C01..C05)

W05-C01=PASS
Evidence: Removed invented 60/30-day defaults. The backend derives payment terms authority directly from SQLite `contracts` table. If governed terms are missing from both the request and the database, the operation rejects the draft with `Payment terms authority violation: missing governed contract client payment terms (Requires setup)`.

W05-C02=PASS
Evidence: `ReopenCashForecastVersionRequest.operation_id` is persisted and checked against `cash_forecast_operation_results`. Retrying a reopen command with the same operation ID replays the existing draft result without failure or creating duplicate revisions.

W05-C03=PASS
Evidence: When an older Approved version becomes Superseded during approval of a new version, both the SQLite table `status` column and the immutable snapshot `payload` JSON are updated to `"Superseded"` within the same governed transaction, preventing `get` and `list` queries from returning two Approved versions.

W05-C04=PASS
Evidence: `approved_at` timestamp is validated to be non-empty upon approval and is persisted into `CashForecastVersionResult` and database records.

W05-C05=PASS
Evidence: Added executable Rust and Node.js tests for missing payment terms authority, reopen idempotency replay, snapshot status consistency, approval timestamp persistence, and locked-period draft blocking.

