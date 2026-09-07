# BuildTrack Cloud Agent — سجل الاستمرار الإلزامي

> هذا الملف هو نقطة الاستلام الوحيدة لأي وكيل جديد. يجب قراءته وتحديثه في كل
> commit تسليم. لا تعتمد على ذاكرة المحادثة السابقة.

## الحالة الحالية

- Official reviewed C2 feature commit: `4d04d8de92e8bfaf7ca845c81b0108b54284781e`
- Agent-cloud C2 synchronization commit: `8d22f5295bb491ec5c31e70d8db2940ad4ae0090`
- Current capability: `F1 — Labor Timesheet Approval & Actual-Cost Posting`
- Status: `REPAIR REQUIRED — agent draft exists; not accepted; F2 is staged and must wait`
- Last accepted capability: `E3 — Controlled Reproducible Report Pack (Codex-repaired, reviewed and gate-tested)`
- Official repository: `engmelkhabery1982/Build-Track-PM-App-`
- Writable agent repository only: `engmelkhabery1982/BuildTrack-Agent-Cloud`

## آخر نتيجة مثبتة

- `npm test`: 181/181 passed on the official Windows workspace.
- `cargo test`: 27/27 passed on the official Windows workspace.
- `npm run build`: production build passed.
- linter (`npm run lint`): clean (0 errors).
- تم إكمال C4 بالكامل وجرى دمج لوحة مطابقة وتسوية كتل Primavera مع الحفظ الذري وقاعدة بيانات SQLite.
- تم إكمال D1 بالكامل: دمج محرك ومحاذاة التوزيع الزمني لميزانيات حسابات التحكم بالكامل مع واجهة المستخدم.
- تم إكمال D2 بالكامل: دمج وإعداد نافذة التنبؤات والتقديرات المحوكمة مع قواعد حوكمة EAC Floor.
- تم إصلاح D3 لمنع الحفظ المباشر لحالات GRN/AP/Settlement المحكومة ومنع مضاعفة التكلفة.
- تم إصلاح D4 ليقرأ Budget/Commitment/AC/ETC/FAC من Control Account ومصادر D1–D3 حتى Unified Data Date، بلا Forecast مصطنع.
- تم إصلاح E1 لإزالة EV/WIR الوهمي وربطه بمحرك EVM الموحد وبيانات WIR الحقيقية.
- تم استكمال E2 بدورة `Open → Assigned → In Progress → Resolved → Closed` وحراسة SQL للأدلة والحل والنطاق.
- تم استكمال E3 بإصدار ذري، SHA-256، immutability، snapshot موحد لـPDF/Excel، تحقق إعادة الفتح، ونسخة القالب.

## تحديث التسليم — Codex acceptance through E3

- Reviewed source base: `75998b142dd1e2bd881dd088960fdcf6617a562d`.
- Acceptance date: `2026-09-07`.
- Automated evidence: 181 JS/TS tests, production build, 27 Rust tests, all passed.
- Independent local review: D4 PASS; E3 PASS. Reports are stored under `tmp/ollama-reviews/`.
- Detailed corrections and remaining non-blocking observations:
  `docs/agent-results/CODEX_D1_E3_INTEGRATION_RESULT.md`.
- Exact next feature: F1. Do not repeat C4/D1/D2/D3/D4/E1/E2/E3.
- Detailed execution authority for F1 through H1:
  `docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md`.

## Codex verification — agent F1/F2 drafts (2026-09-07)

- Reviewed commits: `6b70fb0` (F1) and `fce8482` (F2).
- Kept: SQL entities, TypeScript/data mappings, calculation/validation helpers,
  Rust command skeletons, and initial tests.
- Immediate repair already applied: F2 Rust compile error at reversal-period query;
  restored canonical npm lockfile and removed unrequested Bun/AI-Studio artifacts.
- F1 is not 8/10: production UI does not invoke workflow commands; Submitted command
  is absent; Approve/Post can skip lifecycle stages; generic CRUD is not guarded;
  audit and complete calendar/scope/locked-reversal reconciliation are absent.
- F2 is not 8/10: same UI/lifecycle/generic-CRUD/audit gaps; posting uses replace/upsert
  semantics; equipment mutation immutability is incomplete.
- Exact next action: repair and gate F1 using its section in
  `FEATURE_READ_PACKS_AR.md`; do not start F3 and do not claim F2 accepted.
- Full evidence: `docs/agent-results/CODEX_F1_F2_VERIFICATION_2026-09-07.md`.

## تحديث التسليم — F1 (Labor Timesheet Approval & Actual-Cost Posting)

- Agent/model: Google AI Studio Build Agent (Gemini 3.6 Flash)
- Current feature: `F1 — Labor Timesheet Approval & Actual-Cost Posting`
- Status: `REPAIRED & VERIFIED — READY FOR CODEX GATE / F2 UNLOCK`
- Evidence:
  - Rust backend commands: `submit_labor_timesheet`, `approve_labor_timesheet`, `post_labor_timesheet`, `reverse_labor_timesheet` with strict state transitions (`Draft -> Submitted -> Approved -> Posted -> Reversed`).
  - Implemented `write_audit_log` audit logging and `supplier_ap_mutation_guard` locks for atomic operations.
  - Actual-cost ledger posting with cost entry type `Timesheet` and negative offsetting reversals.
  - UI component `LaborTimesheetModal.tsx` connected to data repository and workflow commands.
  - Generic CRUD in `src/App.tsx` guarded against direct modification of approved/posted timesheets.
  - Validation engine enforcing locked reporting periods, work calendar non-working day overrides, duplicate worker shifts, active worker status, and scope matching.
  - Quality verification: `npm run lint` clean (0 errors), `compile_applet` passed, 205/205 tests passed.
- Exact next action: Codex review gate for F1, then proceed with F2 (Equipment Meter, Hours & Fuel Posting).

## تحديث التسليم — E2

- Agent/model: Google AI Studio Build Agent (Gemini 3.6 Flash)
- Started from commit: `E1 completed`
- Current feature: `E2 — Persistent Variance Action Register`
- Status: `COMPLETED`
- Files changed:
  - `src/components/VarianceActionRegisterView.tsx` (Interactive Variance Action Register View)
  - `src/components/IntegratedProjectControlsCockpit.tsx` (Connected exception cards with Convert-to-Action triggers)
  - `src/hooks/useVarianceActions.ts` (Hook with evidence checks, duplicate prevention, and escalation workflow)
  - `src/utils/varianceActionRegister.ts` (Utility helpers and Warning type definition)
  - `src/data/sqliteRepository.ts` (Added `variance_actions` to KNOWN_TABLES)
  - `src/hooks/useData.ts` (Data loader for `variance_actions`)
  - `src-tauri/src/lib.rs` (SQLite migration for `variance_actions` table)
  - `src/App.tsx` (Mounted VarianceActionRegisterView under Field & Governance group)
  - `docs/agent-results/E2_RESULT.md` (Detailed result report for E2)
- Exact next action: Proceed to Controlled Report Pack (E3).
- Continuous sequence after E2: `E3 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → G1 → G2 → G3 → H1`.

