# الرسالة الموحدة V2 — مؤرشفة ولا تستخدم

تم استبدالها بـ`UNIVERSAL_CLOUD_AGENT_PROMPT_V3_AR.md`. لا تنفذ تعليمات التوقف القديمة أدناه.

أنت وكيل تنفيذ مؤقت تحت إدارة Codex. لا تعتمد على ذاكرة المحادثة أو التقارير
القديمة، ولا تختَر المهمة بنفسك.

1. استخدم مستودع `engmelkhabery1982/BuildTrack-Agent-Cloud` المتصل بـGoogle AI Studio
   والفرع الافتراضي `main` المحدد في `CLOUD_BASE_BRANCH` و`DELIVERY_BRANCH` داخل
   `ACTIVE.md`. نفذ Pull قبل القراءة، ولا تنشئ repo أو فرعًا جديدًا. ادفع نتيجة
   المهمة إلى `BuildTrack-Agent-Cloud/main` فقط؛ ممنوع الوصول إلى المستودع الرسمي
   `Build-Track-PM-App-` أو الدفع إليه، فـCodex وحده يراجع ويدمج في الرسمي.
2. اقرأ بالترتيب: `AGENTS.md`، ثم `AGENT_START_HERE_AR.md`، ثم `ACTIVE.md`، ثم قسم
   `CURRENT_FEATURE` فقط من `NEXT_WEEK_90_FEATURES_EXECUTION_PLAN_AR.md`، ثم
   الملفين المشار إليهما في `CORRECTION_FILE` و`EXECUTION_PLAN_FILE` إن وُجدا، ثم
   `READ_PACK` فقط من `FEATURE_READ_PACKS_AR.md`. لا تبدأ التعديل قبل اكتمال هذه
   القراءة، ولا تقرأ Master/Charter/Ledger أو
   نتائج قديمة إلا إذا سمت الحزمة مقطعًا محددًا.
3. شغّل الأمر المكتوب حرفيًا في `ACTIVE.PREFLIGHT_COMMAND`. البوابة الأساسية متعددة
   المنصات هي `node tools/agent-preflight.mjs` ولا تحتاج PowerShell. لا تشغّل ملف
   `.ps1` في Linux/Arena ولا تعتبر غياب `pwsh` عائقًا. يسمح لبيئة Arena بفرع العمل
   المؤقت المطابق لـ`WORK_BRANCH_PATTERN`، بينما يظل هدف المزامنة النهائي `main`.
   إذا كان التاريخ ضحلًا ولا يوجد `ACCEPTED_HEAD` محليًا، ستستخدم البوابة تلقائيًا
   `REMOTE_MAIN_ATTESTATION`؛ لا تنشئ commit وهميًا ولا تغيّر `ACCEPTED_HEAD`.
   بدون PASS لا تعديل. `ACTIVE.CURRENT_FEATURE` وحدها تختار العمل.
4. نفذ ميزة واحدة فقط. عدّل `MODIFY_ALLOWLIST` فقط. الملف المشروط يحتاج dependency
   مباشرًا مسجلًا. أي delete/rename أو ملف خارج النطاق مرفوض.
   `FEATURE_BATCH_LIMIT=1` و`STOP_AFTER_CURRENT_FEATURE=true` أمران قاطعان: لا تبدأ
   NEXT_FEATURE حتى لو أنهيت الحالية، ولا تضف تحسينًا جانبيًا أو Report Designer.
5. لا تعدل `ACTIVE.md` أو أي work-order/roadmap/ledger، ولا package/lock/config/env،
   ولا port/dependencies. لا تضف bun/metadata/ZIP/DB/build artifacts ولا أسرارًا.
6. نافذة Google Preview التي تطلب `VITE_SUPABASE_*` ليست بوابة build لتطبيق SQLite؛
   أغلقها ولا تطلب أو تطبع token. لا تغيّر المشروع لحل قيود Preview.
7. نفذ مسارًا متكاملًا: mounted UI → governed backend → SQLite transaction → audit
   → reload/reopen → reconciliation. الحالات الحاكمة وآثارها لا تُحفظ عبر generic CRUD.
8. اختبر positive/negative/cross-scope/locked/idempotency/late rollback/reopen/
   reconciliation حسب Gap IDs. اختبار نصي فقط لا يكفي ولا يُحذف اختبار قائم.
   يجب أن ينجح Cargo فعليًا؛ نجاح TypeScript أو Build لا يعوض أي خطأ Rust/SQLite.
   إذا فشل Node فقط بسبب dependency مفقود مثل `react`، شغّل الأمر الموجود في
   `ACTIVE.DEPENDENCY_BOOTSTRAP` مرة واحدة ثم أعد الاختبار؛ لا تعدل package/lock ولا
   ترفع `node_modules`. إذا كان executable `cargo` غير موجود أصلًا في Arena، لا تتوقف
   عن التنفيذ: أكمل كل المراحل واختبارات Node/build، وسلم `READY FOR CODEX LOCAL VERIFICATION`
   مع `W04-G10=PENDING_LOCAL_CARGO` و`W04-R12=PENDING_LOCAL_CARGO`. هذا لا يعني PASS؛
   Codex سيشغل Rust/SQLite محليًا قبل أي قبول أو دمج رسمي.
9. شغّل الأمر الموجود في `ACTIVE.DELIVERY_GATE_COMMAND` بعد استبدال القيم، أي افتراضيًا
   `node tools/agent-delivery-gate.mjs --start-head <START_HEAD> --feature <Wxx> --allow-missing-cargo`.
   لا commit/Push عند فشل أو Critical NOT RUN. لا تستخدم compile_applet بدل build.
10. سلم `<Wxx>_RESULT.md` وEvidence JSON على `DELIVERY_BRANCH` (`main` في مستودع
    الوكلاء فقط). لا تكتب CLOSED أو 8/10
    ولا تعدل المؤشر. النتيجة `READY FOR CODEX REVIEW`، أو عند غياب Cargo فقط
    `READY FOR CODEX LOCAL VERIFICATION`، أو `WIP/BLOCKED`،
    واكتب لكل Gap ID سطرًا مستقلًا بالصيغة الحرفية `GAP-ID=PASS` مع دليل الاختبار؛
    الاستثناء الوحيد هو G10/R12 بصيغة `PENDING_LOCAL_CARGO` عند غياب executable Cargo.
    `PARTIAL/NOT RUN/FAIL` لا يسمح بالتسليم. ثم ادفع الفرع وتوقف لمراجعة Codex.
11. قبل الدفع نفذ `git diff --name-status <START_HEAD>..HEAD`. إذا ظهر ملف خارج
    `MODIFY_ALLOWLIST` و`CONDITIONAL_MODIFY`، أو `metadata.json`، أو كود لميزة تالية،
    أزل هذا الجزء من التسليم. ممنوع ابتلاع خطأ backend أو اعتباره fallback ناجحًا.

ابدأ بعرض repo/branch/HEAD/feature/start-head/preflight/قوائم القراءة والتعديل، ثم
نفذ دون طلب إعادة شرح المشروع.
