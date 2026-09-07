# Codex Integration Result — D1 through E3

Date: 2026-09-07

## Decision

The cloud-agent delivery was not accepted blindly. Codex traced the production
data flow, corrected the material defects, added database transaction boundaries
and regression gates, and accepted the coherent D1–E3 increment after all local
tests passed.

## Material corrections made

- D1: valid curve values, real weekly/monthly/quarterly calendar periods, exact
  penny reconciliation, and atomic approval/supersession/audit of a Cost Plan.
- D2: removed fabricated progress assumptions, required the selected Control
  Account and its approved D1 plan, enforced the FAC floor, and made approved
  estimate versions atomic and immutable through the governed command path.
- D3: routed GRN acceptance, supplier invoice approval and payment settlement
  through governed transactions; removed duplicate direct cost posting and tax
  double counting.
- D4: replaced the legacy `costs`-summary forecast with one leaf per Control
  Account. Budget comes from its approved D1 plan, AC from dated Cost Entries,
  commitment from dated non-cancelled POs, and ETC/FAC from the approved D2
  estimate for that exact account. Missing forecast now displays Unavailable.
- E1: removed manufactured EV, WIR numbers, dates and contractors; the cockpit
  consumes the unified Data Date, real WIR rows and the central EVM engine.
- E2: added the full Assigned/Resolved lifecycle, resolution/evidence rules,
  scope checks, transition guards and immutable closed-state enforcement.
- E3: added atomic issue/supersede/audit, SHA-256 verification, immutable issued
  reports, template snapshotting and PDF/Excel export from the same frozen source.

## Acceptance evidence

- `npm test`: 181/181 passed.
- `npm run build`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 27/27 passed.
- `git diff --check`: passed; only Git line-ending notices were emitted.
- Local read-only Ollama gates: D4 PASS and E3 PASS.

## Honest scope note

The accepted 8/10 target applies to the defined local BuildTrack feature gates,
not to full SAP PS parity. Enterprise electronic signature, central web
collaboration, and external ERP/document integrations remain later roadmap work.
