# W05 — READY FOR CODEX LOCAL VERIFICATION

Status: READY FOR CODEX LOCAL VERIFICATION

W05-G01=PASS — only approved certificates, posted AP and committed PO sources enter the engine; Draft/unsupported rows are excluded.
W05-G02=PASS — explicit ISO Data Date separates settled actuals from remaining forecast.
W05-G03=PASS — missing payment terms return Requires setup/null; explicit terms use calendar days.
W05-G04=PASS — partial settlement leaves remaining forecast; fully paid sources produce zero forecast.
W05-G05=PASS — inflow/outflow direction is preserved.
W05-G06=PASS — Draft/Approved/Superseded version model and maker-checker approval are persisted.
W05-G07=PASS — period buckets are rounded to two decimals and retain source IDs.
W05-G08=PASS — scenarios alter forecast assumptions only; actual values remain unchanged.
W05-G09=PASS — closing cash and source lineage are returned per bucket.
W05-G10=PENDING_LOCAL_CARGO — Node tests/build passed; Cargo is unavailable in Arena.

Tests: npm test — 250 passed; npm run build — pass; git diff --check — pass.
