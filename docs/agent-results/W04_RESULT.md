# W04 — READY FOR CODEX LOCAL VERIFICATION

Status: READY FOR CODEX LOCAL VERIFICATION

START_HEAD=2e89cd6af553dae8bca4ca91ef7cfbdd771b784f

Evidence commands completed in Arena:

- `npm test` — exit 0, 248 tests passed, 0 failed.
- `npm run build` — exit 0; TypeScript and Vite build completed.
- `git diff --check` — exit 0.
- Targeted W04 governance and registration tests — exit 0, 9 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` — Cargo executable unavailable in Arena; reserved for Codex local verification.

W04-G01=PASS
Evidence: mounted `PaymentCertificateWorkbench`, governed selection/read model, source WIR aggregation, reload after governed actions, and targeted W04 tests.

W04-G02=PASS
Evidence: backend draft command validates project/contract/BOQ/WIR/period scope and derives client/subcontract rates from governed BOQ records; missing and cross-scope facts are rejected.

W04-G03=PASS
Evidence: migration 76 adds unique WIR/period/BOQ locks and backend approval inserts each source allocation; over-certification is blocked transactionally.

W04-G04=PASS
Evidence: centralized certificate formula supports gross, retention, advance, deductions, markup, taxable base, tax and net with money rounding and camelCase boundary compatibility.

W04-G05=PASS
Evidence: governed submit, approval, partial-payment and reversal commands enforce the certificate lifecycle; SQL protection and mutation guards are registered.

W04-G06=PASS
Evidence: `certificate_partial_payments` is append-only with positive amounts, operation guards, derived cumulative paid/remaining values, and multiple payment records.

W04-G07=PASS
Evidence: governed certificate transitions synchronize invoice tracking and invoice register facts, forecast/actual cash entries, audit postings, and reload state in the transaction path.

W04-G08=PASS
Evidence: certificate balance utilities and backend calculations include approved/partially-paid/paid cumulative retention and advance balances with caps.

W04-G09=PASS
Evidence: subcontract/client streams remain separately scoped; no generic browser unlock or fallback approval path is used.

W04-G10=PENDING_LOCAL_CARGO
Evidence: Node tests, build, targeted W04 tests, and diff check passed; Cargo execution is pending Codex local verification because `cargo` is unavailable in Arena.

W04-R01=PASS
Evidence: `create_payment_certificate_draft` is the governed backend creation path from identifiers and WIR IDs only; header, source lines, values and audit scope are transaction-bound.

W04-R02=PASS
Evidence: removed UI fallback contract/rate/quantity/unit values and browser lifecycle success; missing governed data returns an error.

W04-R03=PASS
Evidence: backend verifies project, contract hierarchy, reporting period, WIR status, BOQ relationship and certificate type scope.

W04-R04=PASS
Evidence: backend derives `unit_rate` for client certificates and `subcontract_unit_rate` for subcontract certificates and rejects missing rates.

W04-R05=PASS
Evidence: source-level WIR allocations are persisted individually with unique lock constraints and BOQ quantity checks; reversal records are append-only.

W04-R06=PASS
Evidence: certificate workbench exposes source WIR IDs and aggregated quantity/value read model; governed statuses define prior certified scope.

W04-R07=PASS
Evidence: snake_case backend and camelCase UI formula contracts are normalized in `commercialControl.ts`, including rounding and balances.

W04-R08=PASS
Evidence: migration 76 adds lifecycle support tables and immutable partial-payment triggers; backend commands use operation guards and explicit transitions.

W04-R09=PASS
Evidence: operation IDs guard replay, each partial payment has an independent ledger ID, and zero/negative/excess amounts are rejected.

W04-R10=PASS
Evidence: backend transaction path writes certificate, invoice tracking/register, cash, audit and reversal entries without deleting source payment or lock history.

W04-R11=PASS
Evidence: no broad client-certificate unlock is used; client and subcontractor certificates remain contract/BOQ/WIR scoped.

W04-R12=PENDING_LOCAL_CARGO
Evidence: all available Node/build/diff gates passed; full Rust/SQLite execution is pending Codex local Cargo verification.
