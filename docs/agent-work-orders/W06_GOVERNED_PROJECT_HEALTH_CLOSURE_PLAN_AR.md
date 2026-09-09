# W06 — Governed Project Health Score

## حالة البوابة

`PARALLEL_CANDIDATE_ALLOWED_NOT_ACCEPTED`. يجوز تنفيذ مرشح W06 الآن في فرع Arena مستقل،
لكن لا يدمج في `main` ولا يعد مقبولًا قبل قبول W05 وإعادة اختبار مصادر cash/health فوق
W05 المقبولة. نفذ W06 وحدها في هذه الجلسة ولا تعدل W04 أو W05.

## الهدف وشرط 8/10

درجة صحة مشروع واحدة قابلة للتفسير تعتمد على حقائق النطاق والجدول والتكلفة والنقد والجودة
حتى Data Date وإعداد threshold معتمد. أي مدخل حاكم مفقود يمنع Green ويظهر `Requires setup`.

## حزمة القراءة المقيدة

اقرأ قسم `F6` من `FEATURE_READ_PACKS_AR.md` ثم فقط:
`governedHealthScore.ts`, `earlyWarningSystem.ts`, `projectControlAnalytics.ts`,
`GovernedHealthScoreCard.tsx`, `IntegratedProjectControlsCockpit.tsx`، ومستهلكي health المحددين
في Dashboard/ReportPack/Preferences، ومقاطع health config فقط من types/data/hooks/lib والاختبارات.
ممنوع تعديل cash engine/W05 أو schedule/claims/commercial source facts.

## البوابات الإلزامية

- `W06-G01` قاموس موحد للأبعاد: Scope, Schedule, Cost, Cash, Quality/Data Quality.
- `W06-G02` source lineage: كل بعد يعرض القيمة، Data Date، المصدر، freshness والحالة.
- `W06-G03` thresholds versioned/approved؛ لا localStorage ولا constants خفية حاكمة.
- `W06-G04` missing/stale/unapproved input = Requires setup/Amber، ولا Green زائف.
- `W06-G05` weights مجموعها 100%، rounding ثابت، والبعد غير المتاح لا يعاد توزيعه بصمت.
- `W06-G06` اتجاه المؤشرات صحيح: CPI/SPI/cash/data quality وتجاوز scope وفق تعريف موثق.
- `W06-G07` نفس النتيجة في card/cockpit/dashboard/report لنفس project+Data Date+config version.
- `W06-G08` drill-down من الدرجة إلى المخالفة والسجل المصدر، بلا رقم غير قابل للتتبع.
- `W06-G09` lifecycle وإعادة فتح: Draft→Approved→Superseded، immutable وmaker-checker/audit.
- `W06-G10` tests: boundary/missing/stale/cross-project/reopen/rollback + Node/build/Cargo/diff.

## ترتيب التنفيذ

1. جرد جميع المحركات الحالية وإلغاء الحسابات المتوازية دون حذف عشوائي.
2. تعريف input/result/config contract واحد ومحرك pure واحد.
3. إضافة persistence/version approval للحزمة الحاكمة.
4. تحويل كل المستهلكين إلى نفس المحرك ونفس Data Date.
5. إضافة بطاقة تفسير وdrill-down مع source IDs، ثم اختبارات التطابق بين الشاشات.
6. إنشاء `W06_RESULT.md` و`W06_EVIDENCE.json` عبر Delivery Gate فقط.

## حالات القبول الرقمية

- كل الأبعاد Green وfresh: الدرجة/اللون متطابقان في كل الشاشات.
- غياب cost baseline أو schedule baseline: النتيجة ليست Green وتحدد المدخل الناقص.
- قيمة على حد threshold تختبر الجانبين بدقة بلا اختلاف rounding.
- سجل من مشروع آخر لا يؤثر، وتغيير Data Date لا يكتب في source facts.

أي نقص Cargo في Arena = `PENDING_LOCAL_CARGO` فقط؛ أي فشل آخر = `WIP/BLOCKED`.
