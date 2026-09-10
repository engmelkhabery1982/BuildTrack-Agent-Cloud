# W05 — Versioned Cash Forecast Assumptions

## حالة البوابة

`PARALLEL_CANDIDATE_ALLOWED_NOT_ACCEPTED`. يجوز تنفيذ مرشح W05 الآن في فرع Arena مستقل
للاستفادة من وقت الوكلاء، لكن لا يدمج في `main` ولا يعد مقبولًا قبل قبول W04 وإعادة اختبار
ربط certificate/cash فوق W04 المقبولة. نفذ W05 وحدها في هذه الجلسة ولا تبدأ W06.

## الهدف وشرط 8/10

توقع نقدي زمني قابل للتدقيق يفصل Actual عن Forecast، يثبت افتراضاته وإصداره وData Date،
ولا يعيد توقع حركة سُددت أو يخترع تاريخًا/مبلغًا. كل رقم يرجع إلى شهادة/فاتورة/PO/شروط دفع.

## حزمة القراءة المقيدة

اقرأ قسم `F5` من `FEATURE_READ_PACKS_AR.md` ثم فقط:
`cashForecast.ts`, `cashFlowForecast.ts`, `CashFlowForecastBoard.tsx`, `paymentTerms.ts`،
ومقاطع cash/certificate/PO/AP فقط من types/data/hooks/App/lib، والاختبارين المحددين بالحزمة.
ممنوع قراءة أو تعديل Claims، scheduling، reports، health/W06 أو ملفات خارج allowlist الفعلي.

## البوابات الإلزامية

- `W05-G01` مصدر موثوق: Approved certificate/posted AP/PO commitment فقط؛ Draft لا يدخل.
- `W05-G02` Data Date: Actual حتى التاريخ، Forecast بعده، ولا تاريخ UTC منزلق.
- `W05-G03` Payment terms: due date من شروط العقد/المورد المعتمدة؛ missing = Requires setup.
- `W05-G04` Settlement: partials تقلل الرصيد المتوقع، والمدفوع بالكامل لا يعاد إدراجه.
- `W05-G05` فصل الاتجاه: client inflow، subcontract/supplier outflow، بلا قلب إشارة.
- `W05-G06` Versioning: Draft→Approved/Superseded، snapshot/assumptions immutable وmaker-checker.
- `W05-G07` Time phasing: buckets تقويمية متصلة، rounding إلى 0.01 ومصالحة إلى المصدر.
- `W05-G08` Scenario: Base/Optimistic/Pessimistic يغير الافتراضات فقط ولا يغير actual/source.
- `W05-G09` مؤشرات القرار: closing cash، peak deficit، funding date وقابلية trace لكل bucket.
- `W05-G10` persistence واختبارات: save/reopen/idempotency/rollback/locked period + Node/build/Cargo/diff.

## ترتيب التنفيذ

1. ثبت schema/version/assumption source وtyped mappings.
2. ابنِ engine نقيًا ثم transaction للحفظ/الاعتماد.
3. اربط certificates بعد W04 وsupplier AP/PO بلا ازدواج.
4. اربط board بإصدار مختار وData Date مع drill-down للمصادر.
5. أضف اختبارات الأرقام السالبة والجزئية والتكرار وإعادة الفتح والفشل المتأخر.
6. أنشئ `W05_RESULT.md` و`W05_EVIDENCE.json` عبر Delivery Gate فقط.

## تصحيح Codex الإلزامي قبل W06

نفذ `W05-C01..C09` من `docs/agent-results/CODEX_W05_REVIEW_2026-09-10.md` كلها،
ولا تعتبر نجاح الاختبارات النصية دليلًا على صحة التنفيذ. بالنسبة للفجوات الجديدة:

1. `C06`: استبدل `add_days_iso` بحساب Gregorian دقيق؛ لا تستخدم 30 يومًا للشهر أو
   365 يومًا للسنة. اختبر نهاية فبراير في سنة عادية وكبيسة، نهاية الشهر، ونهاية السنة.
2. `C07`: استخرج `supplier_id`/`contract_id` من كل AP/PO ثم اجلب شروط الدفع المعتمدة
   لنفس المصدر تحديدًا. لا تستخدم أول عقد باطن بالمشروع كمرجع عام. الغياب أو تعدد المرجع
   = `Requires setup` مع `source_id`، ولا ينشأ bucket.
3. `C08`: أنشئ parsing/validation صريحًا للحقول المالية والتواريخ والنوع والحالة. لا تستخدم
   `unwrap_or(0.0)` أو `unwrap_or(data_date)` أو `unwrap_or("Client")` للحقول الحاكمة.
   الاختبار السلبي يجب أن يثبت عدم دخول السجل المشوه في الأرقام.
4. `C09`: بعد آخر تعديل شغّل Node + lint + build + Cargo + diff، ثم ولّد Evidence جديدًا
   ببصمات الملفات النهائية ونتائج حقيقية فقط. أصلح `package-lock` ليطابق `package.json`
   ولا تحذف أي dependency معلن.

## حالات القبول الرقمية

- شهادة عميل 1000، مسدد 400: Actual=400 وForecast remaining=600 مرة واحدة.
- AP=300 مسدد بالكامل: Actual outflow=300 وForecast=0.
- ثلاثة مصادر في bucket واحد: المجموع يساوي تفاصيل drill-down بفارق أقصى 0.01.
- تغيير Data Date يعيد التصنيف Actual/Forecast دون تعديل أي سجل مصدر.

أي نقص Cargo في Arena = `PENDING_LOCAL_CARGO` فقط؛ أي فشل آخر = `WIP/BLOCKED`.
