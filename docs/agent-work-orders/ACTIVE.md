# BuildTrack Agent Task Pointer

هذا الملف هو **المصدر الوحيد لاختيار المهمة**. التقارير والسجل والمحادثات لا تختار
المهمة. يملكه Codex وحده؛ الوكيل ممنوع من تعديله.

```text
STATE_SCHEMA=3
OWNER=CODEX
AGENT_MUST_NOT_EDIT=true
ACCEPTED_HEAD=ffeb0aeae3d4b72a67825b2b94226454a4147389
ACCEPTED_LINEAGE_MODE=ANCESTOR_OR_REMOTE_MAIN_ATTESTATION
ACCEPTED_ATTESTATION_FILE=docs/agent-results/CODEX_W03_ACCEPTANCE_2026-09-09.md
ACCEPTED_ATTESTATION_SHA256=C96E8F633699FCAE6F9E5A782AC34FFE2634A290BDE071078E91205C0F827659
CLOUD_BASE_BRANCH=main
DELIVERY_BRANCH=main
WORK_BRANCH_PATTERN=^(main|arena/[A-Za-z0-9._-]+)$
PREFLIGHT_COMMAND=node tools/agent-preflight.mjs
DELIVERY_GATE_COMMAND=node tools/agent-delivery-gate.mjs --start-head <START_HEAD> --feature <Wxx> --allow-missing-cargo
CLOUD_CAPABILITY_MODE=IMPLEMENT_AND_HANDOFF_IF_RUST_UNAVAILABLE
DEPENDENCY_BOOTSTRAP=npm ci --ignore-scripts
W04_SEED_SOURCE=archive/w04-unreviewed-20260909
W04_SEED_FILES=src-tauri/src/certificate_workflow.rs|src/components/PaymentCertificateWorkbench.tsx|tests/payment-certificate-governance.test.mjs
CURRENT_FEATURE=W04
EXECUTION_MODE=OPEN_SEQUENTIAL_CANDIDATE_QUEUE
OPEN_FEATURE_RANGE=W04-W90
FEATURE_CARD_SYSTEM=docs/agent-work-orders/OPEN_90_FEATURE_EXECUTION_SYSTEM_AR.md
PROJECT_MODEL=docs/agent-work-orders/COMPACT_PROJECT_MODEL_AR.md
QUEUE_CURSOR=docs/agent-results/AGENT_QUEUE_CURSOR.md
CURRENT_TITLE=Governed Payment Certificate and Invoice Reconciliation Correction
CURRENT_STATUS=IN_PROGRESS_NOT_ACCEPTED
CODEX_REVIEW_STATUS=CORRECTION_REQUIRED_AFTER_LOCAL_REVIEW
W04_CANDIDATE_HEAD=d5551efe14decac880d002512493afba0d178618
W04_RESUME_RULE=PULL_AGENT_CLOUD_MAIN_AND_CORRECT_CANDIDATE_IN_PLACE
FEATURE_BATCH_LIMIT=87
STOP_AFTER_CURRENT_FEATURE=false
PARALLEL_CANDIDATE_FEATURES=W05|W06
PARALLEL_CANDIDATE_MODE=OPTIONAL;SINGLE_SESSION_SEQUENTIAL_IS_DEFAULT
PARALLEL_INTEGRATION_GATE=W04_MUST_BE_ACCEPTED_BEFORE_W05;W05_MUST_BE_ACCEPTED_BEFORE_W06
OUT_OF_SCOPE_COMMITS=FORBIDDEN
PREREQUISITE=W03:CLOSED_8_OF_10_BY_CODEX
SPEC_ANCHOR=W04
SPEC_FILE=docs/agent-work-orders/NEXT_WEEK_90_FEATURES_EXECUTION_PLAN_AR.md
CORRECTION_FILE=docs/agent-work-orders/W04_CODEX_REVIEW_AND_CORRECTION_AR.md
EXECUTION_PLAN_FILE=docs/agent-work-orders/W04_EXECUTION_CLOSURE_PLAN_AR.md
READ_PACK=RP-W04
UNIFIED_PROMPT=docs/agent-work-orders/UNIVERSAL_CLOUD_AGENT_PROMPT_V3_AR.md
NEXT_FEATURE=W05
NEXT_FEATURE_PLAN=docs/agent-work-orders/W05_VERSIONED_CASH_FORECAST_CLOSURE_PLAN_AR.md
FOLLOWING_FEATURE=W06
FOLLOWING_FEATURE_PLAN=docs/agent-work-orders/W06_GOVERNED_PROJECT_HEALTH_CLOSURE_PLAN_AR.md
DELETE_ALLOWLIST=[]
MODIFY_ALLOWLIST=src-tauri/src/certificate_workflow.rs|src-tauri/src/lib.rs|src/components/PaymentCertificateWorkbench.tsx|src/data/commercialWorkflow.ts|src/data/index.ts|src/data/sqliteRepository.ts|src/hooks/useData.ts|src/types/index.ts|src/utils/commercialControl.ts|src/App.tsx|tests/invoice-certificate-reconciliation.test.mjs|tests/payment-certificate-governance.test.mjs|tests/tauri-command-registration.test.mjs|docs/agent-results/W04_RESULT.md|docs/agent-results/W04_EVIDENCE.json
CONDITIONAL_MODIFY=src/data/dataDictionary.ts|src/utils/paymentTerms.ts|src/utils/quantityLedger.ts|tests/phase1-commercial.test.mjs|tests/contract-schedule-wir-acceptance-20260825.test.mjs
FORBIDDEN=AGENTS.md|docs/agent-work-orders/**|package.json|package-lock.json|bun.lock|src-tauri/Cargo.toml|src-tauri/Cargo.lock|vite.config.*|.env*|metadata.json
REQUIRED_GAPS=W04-G01|W04-G02|W04-G03|W04-G04|W04-G05|W04-G06|W04-G07|W04-G08|W04-G09|W04-G10|W04-R01|W04-R02|W04-R03|W04-R04|W04-R05|W04-R06|W04-R07|W04-R08|W04-R09|W04-R10|W04-R11|W04-R12
REQUIRED_TESTS=npm test|npm run build|cargo test --manifest-path src-tauri/Cargo.toml|git diff --check
KNOWN_FAILED_DELIVERY=archive/w04-unreviewed-20260909|d5551efe14decac880d002512493afba0d178618
```

قواعد حاسمة:

- ابدأ فقط بعد نجاح `tools/agent-preflight.ps1`.
- ابدأ من أحدث `agent-cloud/main`؛ فهو يحتفظ بالأجزاء الصحيحة من مرشح W04 ويضيف مراجعة Codex.
  لا تبدأ W04 من الصفر ولا تدّع أن `W04_CANDIDATE_HEAD` مقبول في المنتج.
- نفذ تصحيح W04 وحده ولا تبدأ W05 أو Report Designer.
- الحزمة السابقة في `KNOWN_FAILED_DELIVERY` مرجع فشل فقط وليست base ولا مصدر كود.
- لا تعدل قائمة `CONDITIONAL_MODIFY` إلا عند إثبات dependency مباشر وتسجيل السبب.
- لا commit ولا Push قبل نجاح `tools/agent-delivery-gate.ps1`.
- لا تكتب `PASS` أو `CLOSED` أو تقييمًا ذاتيًا. النتيجة الوحيدة المسموحة:
  `READY FOR CODEX REVIEW` أو `WIP/BLOCKED`.
- يجوز لوكيلين منفصلين إعداد مرشحي W05 وW06 بالتوازي وفق خطتيهما، كل ميزة في فرع Arena
  مستقل، لكن يُمنع دمجهما في `main` أو تغيير `CURRENT_FEATURE`. التسليم للمراجعة فقط،
  ويعاد ربط W05 بعد W04 ثم W06 بعد W05 قبل أي قبول رسمي.

