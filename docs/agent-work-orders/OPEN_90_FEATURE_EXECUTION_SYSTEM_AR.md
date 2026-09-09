# BuildTrack — نظام تنفيذ الميزات W01–W90

## اكتمال التخطيط

كل ميزة من W01 إلى W90 لها تعريف خاص في
`NEXT_WEEK_90_FEATURES_EXECUTION_PLAN_AR.md`. بطاقة التنفيذ الكاملة للميزة تتكون إلزاميًا من:

1. سطر الميزة المحدد وحده في الخطة (النتيجة الوظيفية الخاصة).
2. حزمة القراءة/التعديل المقيدة من `FEATURE_READ_PACKS_AR.md` حسب الجدول أدناه.
3. مراحل التنفيذ الثماني المشتركة أدناه.
4. عشر بوابات قبول `Wxx-G01..G10` مع الدليل التنفيذي.

بهذا لا يكرر الوكيل 90 صفحة متشابهة ولا يقرأ المشروع كاملًا، مع بقاء كل بطاقة محددة.

## خريطة البطاقات

| الميزات | الحزمة |
|---|---|
| W01 | F1/W01 |
| W02 | F2/W02 |
| W03 | F3/RP-W03 |
| W04 | F4/RP-W04 + ملفا تصحيح W04 |
| W05 | F5 + خطة W05 |
| W06 | F6 + خطة W06 |
| W07 | F7 |
| W08 | F8 |
| W09 | F9 |
| W10 | G1 |
| W11 | G2 |
| W12 | G3 |
| W13 | RP-D1-E2E |
| W14–W26 | RP-D2-SCOPE |
| W27–W39 | RP-D3-SCHEDULE |
| W40–W52 | RP-D4-COST |
| W53–W65 | RP-D5-PROGRESS |
| W66–W78 | RP-D6-IMPORT |
| W79–W90 | RP-D7-GOVERNANCE |

## مراحل كل ميزة — لا تُختصر

1. **Discover:** ابحث بالرموز داخل الحزمة فقط، وسجل الموجود ACCEPT والفجوة REPAIR.
2. **Contract:** حدد inputs/outputs/source/status/Data Date والوحدة/العملة ومصدر كل رقم.
3. **Persist:** عند الحاجة فقط أضف SQL columns/FK/unique/guard وdictionary/mapping/types.
4. **Govern:** نفذ scope، lifecycle، maker-checker، period lock، idempotency وrollback.
5. **Compute:** محرك pure واحد؛ rounding/units/calendar/null behavior معلنة دون fallback.
6. **Wire:** UI يستدعي المسار الحاكم ثم reload؛ يثبت reopen وdrill-down للمصدر.
7. **Verify:** positive وnegative وcross-scope وduplicate وlocked وlate-failure وreconciliation.
8. **Deliver:** commit واحد للميزة، نتيجة/Evidence، تحديث cursor، ثم الميزة التالية.

## بوابات Wxx-G01..G10

- G01 النتيجة الوظيفية الخاصة بالميزة تعمل من UI حتى SQLite/reopen.
- G02 النطاق والعلاقات وFK/cross-project/contract صحيحة.
- G03 لا قيمة أو تاريخ أو حالة وهمية؛ source lineage ظاهر.
- G04 الحساب/الوحدة/العملة/التقريب يتصالح مع المصدر.
- G05 lifecycle وmaker-checker والصلاحيات وقفل الفترة.
- G06 transaction ذرية وidempotent وتتحمل duplicate/concurrency.
- G07 reversal/history غير هدّام وaudit مترابط.
- G08 كل المستهلكين يعرضون نفس الرقم عند نفس Data Date.
- G09 reload/reopen/import أو السيناريو السلبي الخاص مثبت.
- G10 الاختبارات المتاحة + build + diff + evidence؛ Cargo المفقود يبقى Local Pending.

## قائمة التنفيذ المفتوحة

- W01–W03: مرجع مقبول؛ لا يعاد تنفيذه إلا إن أثبتت ميزة لاحقة regression مباشرًا.
- W04–W90: `OPEN_FOR_CANDIDATE_EXECUTION` بالتسلسل في محادثة/فرع واحد.
- فشل ميزة لا يمنع إعداد الميزة التالية في Agent Cloud، لكنه يسجل `NEEDS_CODEX_REVIEW`
  ولا يسمح بإدخال أي من المرشحات إلى المستودع الرسمي.
- بعد كل ميزة: commit مستقل ثم push إن أمكن، وتحديث
  `docs/agent-results/AGENT_QUEUE_CURSOR.md` بحد أقصى 40 سطرًا.

## ضغط المحادثة

بعد كل ميزة اكتب في cursor فقط: feature، commit، files، tests، pending، next. احذف التكرار
من رسالتك ولا تعِد سرد المشروع. عند انتقال نموذج/جلسة، اقرأ الخريطة المختصرة + cursor + بطاقة
الميزة التالية فقط؛ لا تقرأ المحادثة القديمة ولا النتائج القديمة كاملة.
