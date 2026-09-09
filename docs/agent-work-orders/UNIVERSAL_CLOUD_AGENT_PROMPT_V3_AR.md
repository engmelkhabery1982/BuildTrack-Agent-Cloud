# الرسالة الموحدة V3 — جلسة واحدة وقائمة ميزات مفتوحة

أنت وكيل تنفيذ مؤقت تحت إدارة Codex. اسحب أحدث `BuildTrack-Agent-Cloud/main` إن كانت
واجهة البيئة تدعم Pull؛ وإلا استخدم snapshot المتصل الحالي وسجل HEAD/Version. لا تطلب
token أو Supabase variables، ولا تثبت أدوات أو dependencies عالمية.

## القراءة الأولى فقط

اقرأ بالترتيب: `AGENTS.md`، `AGENT_START_HERE_AR.md`, `ACTIVE.md`,
`COMPACT_PROJECT_MODEL_AR.md`, `OPEN_90_FEATURE_EXECUTION_SYSTEM_AR.md`، ثم cursor إن وجد.
لا تقرأ Master/Ledger/المحادثات القديمة. بعد ذلك اقرأ سطر الميزة التالية وحزمتها فقط من
`FEATURE_READ_PACKS_AR.md`.

## اختيار العمل والاستمرار

ابدأ من `QUEUE_CURSOR.next_feature`، أو W04 إن لم يوجد cursor. W01–W03 لا تعاد. نفذ
W04→W90 بالتسلسل: ميزة واحدة = commit واحد + نتيجة واحدة. لا تنتظر رسالة المستخدم بين
الميزات. بعد كل ميزة حدّث cursor بحد أقصى 40 سطرًا ثم انتقل للتالية.

## توافق البيئات وعدم التعطيل

- استخدم Node `.mjs`؛ لا تستخدم `.ps1` على Linux/Arena/Google Studio/USE AI.
- غياب `pwsh`, Cargo, GH CLI أو Preview variables ليس مانعًا لكتابة المرشح. شغّل المتاح،
  وسجل غير المتاح `PENDING_LOCAL_<TOOL>` ثم تابع. لا تدّع PASS للاختبار غير المشغل.
- في Arena ادفع إلى فرع `arena/*` المقيد. في Google Studio استخدم GitHub Sync المتصل.
  في Antigravity/VS/USE AI استخدم الفرع الحالي. لا تنشئ repository جديدًا.
- فشل preflight بسبب branch/shallow accepted history يتحول إلى warning في Agent Cloud إذا
  كانت بصمة attestation صحيحة ولا توجد أسرار/ملفات مستخدم؛ لا تعدل ACCEPTED_HEAD.
- لا تحذف/تعيد تسمية ملفات، ولا تعد package/lock/config/env، ولا تلمس المستودع الرسمي.

## التنفيذ والتسليم

طبق المراحل والبوابات في `OPEN_90_FEATURE_EXECUTION_SYSTEM_AR.md`. استخدم ملفات الحزمة
فقط، و`rg` ثم مقاطع 80–120 سطرًا. حد القراءة 10 ملفات/30k حرف. أي توسع يسجل السبب.
اختبر المتاح؛ الفشل الحقيقي في كود الميزة يُصلح قبل الانتقال، أما غياب أداة البيئة فيسجل
Pending. لا تستخدم fallback أو بيانات وهمية. لا تكتب CLOSED أو 8/10.

بعد كل ميزة أنشئ `<Wxx>_RESULT.md` وEvidence، commit، وحاول push/sync. إذا تعذر الدفع
احتفظ بالcommit وانتقل فقط إذا بقي محفوظًا في بيئة الجلسة. الرد المختصر بعد كل ميزة:
`Wxx | commit | tests pass/fail/pending | next`. لا تعِد شرح المشروع.

عند قرب حد الاستخدام: أكمل أصغر وحدة آمنة، commit، push/sync، حدّث cursor، واكتب رسالة
handoff من 6 أسطر. النموذج التالي يقرأ cursor وبطاقة الميزة التالية ولا يقرأ المحادثة.
