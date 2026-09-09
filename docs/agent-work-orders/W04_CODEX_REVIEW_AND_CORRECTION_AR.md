# W04 — نتيجة مراجعة Codex وأمر التصحيح الإلزامي

## القرار

التسليم المحفوظ في `archive/w04-unreviewed-20260909` مفيد كمسودة، لكنه **غير مقبول
للدفع إلى المنتج**. لا تحذفه ولا تنسخه wholesale. ابدأ من `ACTIVE.ACCEPTED_HEAD`،
واستخدم المسودة كمرجع قراءة فقط عند الحاجة. المطلوب تصحيح W04 وحده وإثبات كل بوابة.

## مراجعة Codex المحلية للمرشح d5551ef — 2026-09-09

المرشح مفيد ويُستكمل **في مكانه** ولا يُعاد من الصفر، لكنه غير مقبول بعد ولا يحقق 8/10.
نجح محليًا `npm test` (248/248)، و`npm run build`، و`cargo test` (47/47)،
و`git diff --check`. مع ذلك، أمر Rust الموجّه إلى `certificate_workflow::tests`
شغّل **صفر اختبار**؛ فلا يوجد أي Rust/SQLite test تنفيذي لـW04. اختبارات Node التسعة
تفحص utilities/text ولا تثبت المعاملة الخلفية.

الفجوات التي يجب إغلاقها قبل إعادة التسليم:

1. `eligibleWirs` يرشح بالمشروع والفترة فقط ولا يرشح بـ`selectedContractId`؛ لذلك يرسل
   WIRs من عقود أخرى، ثم يفشل command بالكامل أو يخلط العرض. يجب أن يرشح contract وBOQ
   والنوع، وأن يعيد reset للاختيارات عند تغيير scope.
2. شاشة الإنشاء تعرض retention/tax/advance/deductions/notes، لكن command لا يرسلها ولا
   يشتقها؛ والـbackend ينشئ Draft بلا شروط تجارية فتُحسب صفرًا عند الاعتماد. احذف حقول
   UI الحاكمة أو اشتق جميع الشروط من contract terms الموثوقة في الخلفية، مع
   `Requires setup` عند غيابها.
3. الاعتماد ما زال يقبل `wir_locks` اختياريًا من UI ويثق في quantity/amount/period؛ يمكن
   اعتماد شهادة بلا locks أو بقيم مزورة. يجب ألا يقبل command locks مالية من UI؛ يعيد
   اشتقاقها من certificate items + WIR/BOQ/period داخل نفس transaction.
4. frontend يبني `certifiedAmount` من `client_amount/subcontract_amount` بينما Draft
   الخلفي يحفظ `amount` فقط؛ الناتج الحالي صفر. أصل المشكلة يُحل بإزالة المدخل الموثوق
   من UI واشتقاق المبلغ خلفيًا، لا بمجرد تغيير اسم الحقل.
5. approval يسمح `Draft` رغم أن lifecycle الملزم هو Submitted فقط، ولا يوجد maker-checker
   بين `submitted_by` و`approved_by`.
6. WIR lock uniqueness هي `(wir_id, period_id, boq_item_id)` ولا تفصل entitlement stream،
   وتسمح بإعادة نفس WIR في فترة أخرى. كذلك reversal يسجل reversal row لكن فحص duplicate
   لا يعتبره release، فيبقى المصدر مقفولًا فعليًا. صمّم stream صريحًا وactive-lock semantics.
7. `cash()` يحذف صفوف cash السابقة للشهادة عند reversal/forecast refresh؛ هذا عكس هدّام
   ومخالف لـappend-only. يجب تسجيل compensating cash rows وعدم حذف Forecast/Actual history.
8. draft لا يولد certificate number ولا ينشئ/يربط invoice register/tracking، لذلك دالة
   reconciliation غالبًا no-op. يجب إنشاء الروابط والأرقام الحاكمة ذريًا وإثبات تطابق
   paid/remaining في certificate + register + tracking + cash.
9. previous/current/cumulative غير مشتقة ولا محفوظة لكل line، ولا يوجد تجميع حقيقي لخمسة
   WIRs لنفس BOQ في line واحدة.
10. لا يوجد تطبيق Back-to-back contract term؛ البحث في ملفات W04 لا يظهر منطقًا تنفيذيًا.
11. period lock/date regression/operation replay/concurrent overpay/atomic late failure غير
   مختبرة في W04. `guard` الحالي يجعل replay خطأ duplicate بدل إعادة النتيجة نفسها.
12. `W04_EVIDENCE.json` يسجل `end_head` مساويًا لـSTART_HEAD خطأ، ويكرر ملف evidence في
   changes؛ أصلح مولد الدليل أو التقرير ولا تكتب PASS ذاتيًا دون اختبار مطابق.

تعليمات الاستكمال: احتفظ بإصلاحات compile، إزالة fake fallbacks، typed invokes، migration
76، والـUI mounting. لا تعدّل ميزات أخرى. نفذ المراحل 1→7 أدناه مع Rust tests حقيقية، ثم
أعد Delivery Gate. لا تبدأ W05.

## أدلة الفشل الحالية

- `npm test`: ‏239 نجح و2 فشل من 241؛ فشل اختبار الصيغ واختبار retention/advance.
- `cargo test`: لا يبدأ الاختبارات؛ يفشل compile عند `certificate_workflow.rs:351`
  بالخطأ `E0515`، مع `period_id` محسوب ثم غير مستخدم عند السطر 555.
- `calculateCertificateValues` يستقبل snake_case بينما Workbench والاختبار يرسلان camelCase؛
  لذلك القيمة المحسوبة في الواجهة صفر.
- لا يوجد `W04_RESULT.md` ولا `W04_EVIDENCE.json` في التسليم.
- migration المسودة رقم 75، بينما W03 المقبولة تستخدم 75؛ يجب استخدام الرقم الحر التالي.

## فجوات التصحيح الملزمة

### W04-R01 — إنشاء ذري من المصدر

أنشئ command خلفي واحدًا لإنشاء Draft من `projectId/contractId/periodId/certificateType`
و`wirIds` فقط. ممنوع أن تنشئ الواجهة رأس الشهادة بـgeneric repository ثم تستدعي submit.
المعاملة تعيد اشتقاق كل line والقيم وتحفظ header+lines/allocations+audit ذريًا.

### W04-R02 — لا قيم وهمية ولا fallback نجاح

احذف fallbacks مثل quantity `1`، rate `100/80`، unit `m3`، BOQ quantity `1000`،
subcontract rate = 80%، وأول contract عند غياب الاختيار. missing data = رفض واضح. لا يوجد
browser generic CRUD يحاكي نجاح lifecycle عند غياب Tauri.

### W04-R03 — نطاق خلفي كامل

الخلفية تتحقق أن project/contract/BOQ/WIR/reporting period مترابطة. WIR المرشح Approved
وفعّال وفي نطاق العقد والفترة. العميل يستخدم main contract وmain BOQ؛ شهادة الباطن تستخدم
subcontract المختار وربطه بالعقد والبند الرئيسيين. لا يكفي تطابق project فقط.

### W04-R04 — أسعار حقيقية مفصولة

Client line = كمية WIR المؤهلة × سعر بيع بند العقد الرئيسي. Subcontract line = كمية WIR
الخاصة بعقد الباطن × سعر بند عقد الباطن الحقيقي. لا يرسل UI السعر الموثوق ولا يختلقه.
اختبر missing rate وcross-contract rate كحالات رفض.

### W04-R05 — تخصيص وقفل quantity صحيح

لا تسند aggregate quantity لكل WIR كما تفعل المسودة. احفظ allocation لكل WIR بكمية ذلك
الـWIR. امنع استعمال المصدر مرتين عبر فترات، مع فصل entitlement stream للعميل عن الباطن
عندما يسمح نفس WIR بإثبات الاثنين. DB uniqueness/concurrency هي السلطة، وover-certification
مقابل revised BOQ quantity blocking بلا زر Continue.
لا تثق في `periodId` القادم داخل locks؛ اشتقه من رأس الشهادة/الفترة الموثوقة واستخدمه فعليًا.

### W04-R06 — previous/current/cumulative

كل line يعرض ويحفظ مصادره وprevious certified/current/cumulative quantity/value حتى تاريخ
الشهادة. التجميع السابق يشمل Approved وPartially Paid وPaid فقط ويستبعد Reversed، وبنفس
project+contract+BOQ+certificate type.

### W04-R07 — صيغة تجارية مركزية

وحّد أسماء الإدخال/الإخراج والصيغة في backend ثم utility العرض: gross، retention، advance
recovery، deductions، markup، taxable base، VAT/tax، net بدقة 0.01. النسب والحدود تأتي من
شروط العقد أو master صريح؛ UI لا يختار نسبة حاكمة بلا مصدر. اختبر cap والرصيد والتقريب.

### W04-R08 — lifecycle وحماية SQL

المسار حصري Draft→Submitted→Approved→Partially Paid→Paid→Reversed؛ approval من Submitted
فقط، مع maker-checker. triggers تحمي كل حالة غير Draft، وتمنع generic update/delete.
استخدم migration بعد W03/75 ولا تستبدل أو تحذف migration W03.

### W04-R09 — دفعات append-only وidempotency

كل دفعة سجل مستقل بمعرف/operation id دائم. replay للعملية نفسها يرجع نفس النتيجة، والثانية
والثالثة تعملان، وzero/negative/excess مرفوضة. paid/remaining مشتقان من ledger لا من قيم
header قابلة للتلاعب، مع منع concurrent over-payment.

### W04-R10 — AR/AP/Cash وعكس غير هدّام

حدّث certificate وinvoice tracking وinvoice register وcash داخل transaction واحدة، بما في
ذلك paid amount وremaining لا status فقط. Approved ينشئ Forecast؛ الدفعات Actual مستقلة.
العكس لا يحذف locks/payments/cash history؛ ينشئ reversal entries مترابطة ويعيد الرصيد
والحالات حسابيًا. احترم reporting-period lock ولا تستخدم `INSERT OR REPLACE` لإخفاء سجل.

### W04-R11 — Back-to-back اختياري ودقيق

لا تفتح كل شهادات الباطن لمجرد Approved client certificate في نفس المشروع. طبّق blocking
في backend فقط إذا contract term صريح، وبمطابقة main contract+BOQ/WIR quantity/value ومبلغ
تحصيل Actual المرتبط. غياب الشرط يعني Not Applicable لا unlocked عام.

### W04-R12 — اختبارات تنفيذية وتسليم

أضف Rust/SQLite tests حقيقية للإنشاء من 5 WIRs، الفصل السعري، missing/cross-scope، duplicate
وrace، revised-quantity over-certification، locked period، lifecycle، maker-checker،
retention/advance/markup/tax rounding، ثلاث partial payments، idempotent replay، overpay،
atomic rollback، reopen، non-destructive reversal، AR/AP/Cash reconciliation وback-to-back.
صحح اختبارات Node لتستخدم العقد الحقيقي للدوال لا أسماءً متناقضة. شغّل كل REQUIRED_TESTS
وأنشئ W04_RESULT/EVIDENCE؛ عند أي فشل سلّم `WIP/BLOCKED` ولا تبدأ W05.

## ممنوعات إضافية

- لا تعديل Claims/W03 أو Cash Forecast/W05 أو Dashboard/Reports/Primavera.
- لا حذف ملفات أو migrations أو اختبارات قائمة.
- لا إعادة تنسيق شامل لـ`src/App.tsx` أو`src-tauri/src/lib.rs`.
- لا تعتبر warning أو confirm حوكمة؛ الرفض الحاكم يجب أن يكون backend/SQLite.
