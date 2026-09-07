# Feature E3 Result — Controlled Reproducible Report Pack

## Accepted capability

E3 now issues a governed report version from the exact displayed reconciliation
snapshot. The issued version stores its project/portfolio scope, Data Date,
template snapshot, issuer, content snapshot and SHA-256 hash. Issuance and
supersession execute in one SQLite transaction and write an audit row.

## Controls delivered

- Portfolio reports store a null project scope; no project is silently substituted.
- Only a valid `sha256:<64 hex>` snapshot marker can be issued.
- One issued version per scope/report pack is enforced; the prior version is
  superseded atomically.
- Issued versions cannot be edited or deleted through SQLite.
- Reopened versions recompute their hash. A mismatch blocks PDF and Excel export.
- PDF and Excel are generated from the same selected snapshot rather than live
  Dashboard filters. Excel includes summary and governed detail sheets.
- The selected report template is embedded in the snapshot and its identifier is
  stored with the version.

## Verification

- JavaScript/TypeScript acceptance suite: 181/181 passed.
- Production build: passed.
- Rust suite: 27/27 passed, including report issuance rollback and supersession.
- Independent local Ollama gate: PASS (`20260907-054023-E3_controlled_reproducible_report_pack_final_gate.md`).

## Acceptance decision

Accepted for the scoped E3 gate. This is not an electronic-signature or external
document-management platform; those are separate enterprise capabilities.
