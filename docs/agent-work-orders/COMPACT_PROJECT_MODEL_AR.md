# BuildTrack — خريطة المشروع المختصرة للوكلاء

هذا الملف بديل عن قراءة المشروع كاملًا. اقرأه مرة واحدة في أول جلسة، ثم اقرأ بطاقة الميزة
وحزمة ملفاتها فقط. لا تستخدم سجل المحادثة كمصدر حقيقة.

## نموذج الأعمال الثابت

- العقد الرئيسي الواحد ينشئ مشروعًا واحدًا. عقد الباطن يتبع العقد الرئيسي ولا ينشئ مشروعًا.
- BOQ الرئيسي هو نطاق وكمية وسعر بيع العميل. بند الباطن يرتبط ببند رئيسي وتكلفته بسعر الباطن.
- WIR المقبول يثبت كمية منفذة. شهادة العميل تستخدم سعر الرئيسي، وشهادة الباطن سعر عقد الباطن.
- Variation لا يمحو الأصل: Original + Approved Change = Current/Revised مع lineage كامل.
- Baseline مجمد؛ Current يسجل الواقع؛ Forecast توقع منفصل؛ Data Date تاريخ قطع موحد.
- PV/EV/AC والكميات والتكلفة والنقد لا تُعرض دون source IDs وحالة اعتماد وتاريخ قياس.
- كل انتقال حاكم وآثاره وaudit داخل SQLite transaction واحدة، idempotent وmaker-checker.
- Desktop/SQLite هو مصدر الحقيقة الحالي؛ Web/PostgreSQL لاحقًا عبر repository/API دون كسر العقود.

## مسار البيانات

`UI → typed client/hook → governed Tauri command أو repository → SQLite transaction → audit
→ reload/reopen → dashboard/report reconciliation`.

لا تُعد الحالة الحاكمة ناجحة عبر browser fallback أو generic CRUD. لا تختلق rate/date/quantity.
غياب المصدر = `Requires setup/Unavailable`.

## مواضع الكود

- `src/components`: العرض والتفاعل فقط، بلا حقيقة مالية مخترعة.
- `src/utils`: محركات pure قابلة للاختبار؛ لا persistence خفي.
- `src/data`: typed clients، mappings، dictionary، repository contracts.
- `src/hooks/useData.ts`: التحميل وإعادة التحميل، لا lifecycle بديل.
- `src-tauri/src/*.rs`: المعاملات الحاكمة والتحقق والـaudit.
- `src-tauri/src/lib.rs`: migrations/wrappers/registration بمقاطع محددة فقط.
- `tests`: قبول رقمي وتنفيذي، وليس فحص نصوص بدل تشغيل backend.

## قواعد عدم الازدواج

- Source key دائم لكل import/posting/payment.
- لا Actual من PO فقط؛ AC من receipt/AP/cost posting المقبول.
- لا تجمع parent summary مع children مرة ثانية.
- Reversal قيود تعويضية append-only، لا حذف تاريخ.
- نفس المشروع والعقد والبند والفترة والعملـة والوحدة شرط قبل التجميع.

## طريقة القراءة الاقتصادية

اقرأ ملفات السلطة القصيرة، ثم استخدم `rg -n "symbol|table|command" <listed files>`.
افتح 80–120 سطرًا حول التطابق فقط. لا تفتح App/lib/types/repository كاملًا. حد الميزة
الافتراضي 10 ملفات و30,000 حرف؛ أي توسع يسجل سببه في نتيجة الميزة.
