# W04 — خطة التنفيذ وإغلاق الفجوات

هذه الخطة ملزمة وتُقرأ بعد `ACTIVE.md` وملف مراجعة Codex. لا يجوز تغيير ترتيبها أو
اعتبار مرحلة مكتملة قبل نجاح بوابتها. استخدم تسليم الأرشيف كمرجع انتقائي فقط، وابدأ
من أحدث `agent-cloud/main` الذي يحتوي مرشح W04 المحفوظ ومراجعة Codex. يبقى
`ACTIVE.ACCEPTED_HEAD` مرجع المنتج المقبول، بينما `W04_CANDIDATE_HEAD` نقطة الاستكمال؛
لا تعد التنفيذ من الصفر ولا تبدأ W05.

## تعريف الاكتمال

W04 لا تُسلّم إلا إذا:

1. اكتملت `W04-G01..G10` و`W04-R01..R12` جميعًا.
2. لكل ID سطر حرفي `<ID>=PASS` في `W04_RESULT.md` ودليل اختبار تحته.
3. لا يوجد رقم أو كمية أو سعر أو حالة مصدرها fallback أو UI غير موثوق.
4. تنجح Node وTypeScript build وكل Rust/SQLite tests و`git diff --check` فعليًا.
5. لا يوجد حذف، migration collision، generic lifecycle CRUD، أو تعديل لميزة تالية.

## المرحلة 0 — استعادة انتقائية وتجهيز قاعدة سليمة

**الملفات:** `src-tauri/src/lib.rs`، `src-tauri/src/certificate_workflow.rs`،
`src/data/commercialWorkflow.ts`، اختبارات التسجيل.

- أثبت أن HEAD مبني على W03 المقبولة وأن migration 75 الخاصة بها موجودة كما هي.
- انقل فقط الأجزاء المفيدة من الأرشيف؛ ممنوع cherry-pick/نسخ commit W04 كاملًا.
- استخدم migration 76 أو الرقم الحر التالي بعد فحص القائمة، بلا تعديل migrations السابقة.
- أصلح Rust `E0515` وأي warning يدل على منطق غير مستخدم قبل إضافة سلوك جديد.

**بوابة 0:** أصلح عيوب Rust المعروفة وتأكد أن migration numbers فريدة. إن كان Cargo
متاحًا يجب أن ينجح `cargo check`. إن كان executable غير موجود في Arena فقط، سجّل ذلك
ولا تتوقف؛ Codex ينفذ بوابة Cargo محليًا قبل القبول.

## المرحلة 1 — النموذج الذري والنطاق الموثوق

**تغلق:** `W04-R01,R02,R03` وجزء `G01,G02`.

**الملفات الأساسية:** backend workflow/migration، typed client، types، repository mapping.

- command واحد ينشئ Draft من scope + period + certificate type + WIR IDs.
- backend يقرأ WIR/BOQ/contracts/reporting period ويشتق lines؛ لا يقبل gross/rate/lock
  كحقيقة من الواجهة.
- missing أو cross-project/cross-contract/cross-BOQ/unapproved/out-of-period WIR يسبب rollback.
- لا insert/update generic ولا نجاح متصفح بديل.

**بوابة 1:** Rust SQLite positive + كل negative scope cases + atomic rollback.

## المرحلة 2 — الكميات والأسعار والتجميع التراكمي

**تغلق:** `W04-R04,R05,R06` و`G01,G02,G03`.

- خصص كمية كل WIR منفردة ولا تكرر aggregate على كل مصدر.
- lock/unique يمنع إعادة الشهادة في financial stream نفسه حتى عبر فترة أخرى، ويدعم
  الفصل المشروع بين client revenue وsubcontract entitlement.
- قارن بـrevised BOQ quantity، والزيادة backend blocking.
- اشتق client selling rate من main BOQ، وsubcontract rate من BOQ عقد الباطن المرتبط.
- احسب previous/current/cumulative لكل line مع source IDs وبنفس النطاق والنوع.

**بوابة 2:** 5 WIR aggregation، duplicate، concurrent race، over-certification،
client/subcontract separation، missing rate؛ كلها Rust/SQLite وليست utility فقط.

ويجب أن يثبت الاختبار أن frontend لا يرسل كل WIR في المشروع/الفترة: المرشح المؤهل يطابق
`project_id + contract_id + period_id + certificate_type`، وأن تغيير العقد يعيد تصفية المصدر.

## المرحلة 3 — الصيغة التجارية وشروط العقد

**تغلق:** `W04-R07` و`G04,G08`.

- عرّف عقد بيانات واحد snake_case في السجل وcamelCase عند حدود Tauri فقط.
- backend يحسب gross/retention/advance/deductions/markup/tax/net إلى 0.01.
- النسب والحدود من contract terms؛ عند غياب الحقل المطلوب استخدم Requires setup.
- retention/advance cumulative يشمل Approved/Partially Paid/Paid ولا يتجاوز cap/balance.
- امنع تراجع certificate date عن آخر شهادة حاكمة واحترم reporting-period lock.

**بوابة 3:** أمثلة حسابية ثابتة، rounding، cap reached، missing terms، date regression،
locked period. يجب أن تستخدم اختبارات الواجهة نفس contract الحقيقي للدالة.

## المرحلة 4 — دورة الاعتماد والدفعات

**تغلق:** `W04-R08,R09` و`G05,G06`.

- Draft→Submitted→Approved فقط ثم partials حتى Paid، وبعدها Reversed.
- maker-checker؛ SQL يمنع bypass/update/delete لكل حالة غير Draft.
- ledger دفعات append-only؛ cumulative/remaining مشتقان داخل transaction.
- operation ID دائم يمنح idempotent replay، ويمنع concurrent over-payment.

**بوابة 4:** transitions غير القانونية، نفس المستخدم، صفر/سالب/زيادة، ثلاث دفعات، replay،
race، reopen؛ اختبارات تنفيذية مع إعادة فتح DB.

## المرحلة 5 — المصالحة والعكس وBack-to-back

**تغلق:** `W04-R10,R11` و`G07,G09`.

- certificate + invoice register + tracking + cash + audit تتغير في transaction واحدة.
- Approved ينتج Forecast، وكل payment ينتج Actual مستقلًا، والمبالغ/الأرصدة تتصالح.
- reversal قيود عكسية غير هدامة؛ لا DELETE locks/payments/cash history ولا REPLACE.
- Back-to-back = Not Applicable افتراضيًا، ويصبح blocking فقط بشرط عقد صريح وربط
  main contract+BOQ+WIR quantity/value وActual client collection.

**بوابة 5:** فشل متأخر يسبب rollback كامل؛ reconciliation قبل/بعد partial/final/reversal؛
locked reversal؛ back-to-back enabled/disabled/cross-scope.

ممنوع استخدام `DELETE FROM cash_flow` أو حذف locks/payments كآلية عكس؛ المطلوب قيود/حركات
تعويضية append-only، مع اختبار يثبت بقاء السجل الأصلي وإجمالي صافٍ صحيح.

## المرحلة 6 — الواجهة التشغيلية

**تغلق:** الباقي من `W04-G01,G05,G07`.

**الملفات:** `PaymentCertificateWorkbench.tsx` ومقاطع W04 فقط من App/hooks.

- اختيار project→contract→period→type ثم WIR المؤهلة فقط.
- عرض source WIRs وprevious/current/cumulative وrate source والصيغة والرصيد.
- كل action يستدعي command الحاكم ثم reload؛ لا fallback ولا confirm لتجاوز blocker.
- إخفاء/قفل الأفعال حسب lifecycle وإظهار Requires setup/error دون اختلاق قيمة.

**بوابة 6:** mounted render، scope reset، no Rules of Hooks، no fake values، lifecycle
buttons، reload/reopen. `npm test` و`npm run build` ينجحان.

لا تعرض نسب retention/tax أو advance/deductions قابلة للتحرير باعتبارها حاكمة إذا لم تكن
جزءًا من contract terms معتمدًا. اعرض مصدر كل شرط أو `Requires setup`.

## المرحلة 7 — دليل التسليم النهائي

**تغلق:** `W04-R12,G10`.

1. إن ظهر `Cannot find package 'react'` شغّل `npm ci --ignore-scripts` ثم شغّل
   الاختبارات المستهدفة وكل الاختبارات المتاحة.
2. أنشئ `W04_RESULT.md` وفيه كل Gap ID مرة واحدة بصيغة `ID=PASS` ودليل تحته.
3. شغّل أمر Node الموجود في `ACTIVE.DELIVERY_GATE_COMMAND`; الملف الناتج فقط هو
   `W04_EVIDENCE.json`. لا تستخدم PowerShell في Arena.
4. إن فشل أي أمر متاح: صحح W04 فقط وأعده. غياب Cargo executable وحده يسمح بحالة
   `READY FOR CODEX LOCAL VERIFICATION` و`PENDING_LOCAL_CARGO` للبوابتين G10/R12؛
   أي فشل آخر = `WIP/BLOCKED`.
5. لا تبدأ W05، ولا تعدل `ACTIVE.md` أو هذه الخطة.

## مصفوفة الملفات المسموح بوظيفتها

| الملف | الوظيفة الوحيدة في W04 |
|---|---|
| `certificate_workflow.rs` | transactions، derivation، lifecycle، payment/reversal tests |
| `lib.rs` | migration التالية وwrappers/registration فقط |
| `commercialWorkflow.ts` | typed invoke clients فقط |
| `commercialControl.ts` | pure display/reconciliation formulas المطابقة للbackend |
| `PaymentCertificateWorkbench.tsx` | UI orchestration/read model فقط |
| `App.tsx` | import/navigation/mount integration فقط |
| `useData.ts` | W04 read slices/reload فقط |
| `types/index.ts` | W04 contracts فقط |
| اختبارات W04 | سلوك تنفيذي وأرقام ثابتة، لا فحص نصي بديلًا عن backend |

أي حاجة خارج هذه الوظائف تُسجل Blocker ولا توسع النطاق تلقائيًا.
