# Codex W04 Acceptance — 2026-09-10

- Feature: W04 — Governed Payment Certificates and Invoice Reconciliation
- Accepted candidate: `6e9fcde771e9eb4d4e96485e7ca14920f6280cfb`
- Decision: `CLOSED_8_OF_10_BY_CODEX`
- Node acceptance: 274 passed, 0 failed on the integration head; W04 production files are unchanged after the accepted candidate.
- TypeScript lint: passed.
- Production build: passed.
- Rust/SQLite acceptance: 56 passed, 0 failed, including 7 executable W04 certificate workflow tests.
- Verified controls: authoritative contract/period/WIR scope, main/subcontract rate separation, previous/current/cumulative certification, contract-derived commercial terms, maker-checker lifecycle, immutable/idempotent payment history, invoice tracking, append-only reversal, and optional back-to-back control.

This acceptance closes W04 only. It does not accept W05 or any later candidate.
