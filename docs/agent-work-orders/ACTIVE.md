# BuildTrack Agent Task Pointer

هذا الملف هو **المصدر الوحيد لاختيار المهمة**. التقارير والسجل والمحادثات لا تختار
المهمة. يملكه Codex وحده؛ الوكيل ممنوع من تعديله.

```text
STATE_SCHEMA=3
OWNER=CODEX
AGENT_MUST_NOT_EDIT=true
ACCEPTED_HEAD=6e9fcde771e9eb4d4e96485e7ca14920f6280cfb
ACCEPTED_LINEAGE_MODE=ANCESTOR_OR_REMOTE_MAIN_ATTESTATION
ACCEPTED_ATTESTATION_FILE=docs/agent-results/CODEX_W04_ACCEPTANCE_2026-09-10.md
ACCEPTED_ATTESTATION_SHA256=29E5AE7973E4BDB9193C273ACA124B46588FB4231201215D60101A98D8E85CEC
CLOUD_BASE_BRANCH=main
DELIVERY_BRANCH=CURRENT_BOUND_BRANCH
HANDOFF_MARKER=[handoff]
HANDOFF_WORKFLOW=.github/workflows/arena-handoff.yml
WORK_BRANCH_PATTERN=^(main|arena/[A-Za-z0-9._-]+)$
PREFLIGHT_COMMAND=node tools/agent-preflight.mjs
DELIVERY_GATE_COMMAND=node tools/agent-delivery-gate.mjs --start-head <START_HEAD> --feature <Wxx> --allow-missing-cargo
CLOUD_CAPABILITY_MODE=IMPLEMENT_AND_HANDOFF_IF_RUST_UNAVAILABLE
DEPENDENCY_BOOTSTRAP=npm ci --ignore-scripts
CURRENT_FEATURE=W06
EXECUTION_MODE=OPEN_SEQUENTIAL_CANDIDATE_QUEUE
OPEN_FEATURE_RANGE=W04-W90
FEATURE_CARD_SYSTEM=docs/agent-work-orders/OPEN_90_FEATURE_EXECUTION_SYSTEM_AR.md
PROJECT_MODEL=docs/agent-work-orders/COMPACT_PROJECT_MODEL_AR.md
QUEUE_CURSOR=docs/agent-results/AGENT_QUEUE_CURSOR.md
CURRENT_TITLE=Governed Project Health Score
CURRENT_STATUS=OPEN_SEQUENTIAL_CANDIDATE
CODEX_REVIEW_STATUS=W04_ACCEPTED_W05_CORRECTION_BACKLOG_RECORDED
FEATURE_BATCH_LIMIT=87
STOP_AFTER_CURRENT_FEATURE=false
PARALLEL_CANDIDATE_FEATURES=DISABLED
PARALLEL_CANDIDATE_MODE=SINGLE_SESSION_SEQUENTIAL
PARALLEL_INTEGRATION_GATE=EACH_FEATURE_MUST_PASS_ITS_DELIVERY_GATE
OUT_OF_SCOPE_COMMITS=FORBIDDEN
PREREQUISITE=W04:CLOSED_8_OF_10_BY_CODEX;W05:LOCALLY_VERIFIED_CORRECTION_BACKLOG
SPEC_ANCHOR=W06
SPEC_FILE=docs/agent-work-orders/NEXT_WEEK_90_FEATURES_EXECUTION_PLAN_AR.md
CORRECTION_FILE=docs/agent-results/CODEX_W05_REVIEW_2026-09-10.md
EXECUTION_PLAN_FILE=docs/agent-work-orders/W06_GOVERNED_PROJECT_HEALTH_CLOSURE_PLAN_AR.md
READ_PACK=F6
UNIFIED_PROMPT=docs/agent-work-orders/UNIVERSAL_CLOUD_AGENT_PROMPT_V3_AR.md
NEXT_FEATURE=W06
NEXT_FEATURE_PLAN=docs/agent-work-orders/W06_GOVERNED_PROJECT_HEALTH_CLOSURE_PLAN_AR.md
FOLLOWING_FEATURE=W07
FOLLOWING_FEATURE_PLAN=docs/agent-work-orders/NEXT_WEEK_90_FEATURES_EXECUTION_PLAN_AR.md
DELETE_ALLOWLIST=[]
MODIFY_ALLOWLIST=src/utils/governedHealthScore.ts|src/utils/earlyWarningSystem.ts|src/utils/projectControlAnalytics.ts|src/components/GovernedHealthScoreCard.tsx|src/components/IntegratedProjectControlsCockpit.tsx|src/components/Dashboard.tsx|src/components/ReportPack.tsx|src/components/PreferencesPanel.tsx|src/types/index.ts|src/data/dataDictionary.ts|src/data/sqliteRepository.ts|src/hooks/useData.ts|src-tauri/src/lib.rs|tests/early-warning-system.test.mjs|tests/agent-cloud-integration-gates.test.mjs|tests/tauri-command-registration.test.mjs|docs/agent-results/W06_RESULT.md|docs/agent-results/W06_EVIDENCE.json|docs/agent-results/AGENT_QUEUE_CURSOR.md
CONDITIONAL_MODIFY=src/App.tsx
FORBIDDEN=AGENTS.md|docs/agent-work-orders/**|package.json|package-lock.json|bun.lock|src-tauri/Cargo.toml|src-tauri/Cargo.lock|vite.config.*|.env*|metadata.json
REQUIRED_GAPS=W06-G01|W06-G02|W06-G03|W06-G04|W06-G05|W06-G06|W06-G07|W06-G08|W06-G09|W06-G10
REQUIRED_TESTS=npm test|npm run build|cargo test --manifest-path src-tauri/Cargo.toml|git diff --check
KNOWN_FAILED_DELIVERY=arena/01a084ca-buildtrack-agent-cloud@89cffb0:DO_NOT_MERGE_W05_RUST_COMPILE_AND_SCHEMA_FAILURE
```

قواعد حاسمة:

- ابدأ فقط بعد نجاح `node tools/agent-preflight.mjs`.
- ابدأ من أحدث `agent-cloud/main` ومن `AGENT_QUEUE_CURSOR.next_feature`. W04 معتمدة وW05
  محفوظة كمرشح مراجع مع backlog موثق؛ لا تعد تنفيذ أي منهما.
- نفذ W06 من حزمة F6، ثم حدّث المؤشر وانتقل تلقائيًا إلى الميزة التالية بعد نجاح التسليم.
- الفرع الموجود في `KNOWN_FAILED_DELIVERY` مرجع فشل فقط؛ لا تدمجه ولا تستعد ملفات W05 منه.
- لا تعدل قائمة `CONDITIONAL_MODIFY` إلا عند إثبات dependency مباشر وتسجيل السبب.
- لا commit ولا Push قبل نجاح `node tools/agent-delivery-gate.mjs` للميزة الحالية.
- لا تكتب `PASS` أو `CLOSED` أو تقييمًا ذاتيًا. النتيجة الوحيدة المسموحة:
  `READY FOR CODEX REVIEW` أو `WIP/BLOCKED`.
- التنفيذ متتابع داخل الجلسة: ميزة واحدة واختباراتها وتسليمها، ثم الميزة التالية بلا انتظار
  موافقة Codex، مع بقاء قرار `CLOSED — 8/10` من سلطة Codex وحده.

