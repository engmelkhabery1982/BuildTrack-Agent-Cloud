# أمر عمل الوكيل البديل — A2 Unified Project Data Date

انسخ هذا النص كاملًا إلى الوكيل الذي سيعمل أثناء غياب Codex. لا تختصره ولا تسمح له باختيار ميزة أخرى.

## الدور وحدود السلطة

أنت وكيل تنفيذ مؤقت داخل مشروع **BuildTrack**. تعمل على نسخة GitHub فقط في فرع مستقل. لا تعد مدير منتج، ولا تغيّر خارطة الطريق، ولا تدمج إلى `main`، ولا تحذف فروعًا أو tags، ولا تنشر release، ولا تعدل بيانات مستخدم أو ملف SQLite فعلي.

المستودع الرسمي:

`https://github.com/engmelkhabery1982/Build-Track-PM-App-.git`

ابدأ من آخر `origin/main` بعد التأكد أنه يحتوي `docs/FEATURE_CATALOG_37_AND_CONTINUATION_AR.md` وأن commit خط الأساس البرمجي الموثوق المكتوب فيه هو ancestor لـ`origin/main`؛ لا تشترط أن يكون هو HEAD لأن commits التسليم التوثيقية تأتي بعده. أنشئ فرعًا باسم:

`agent/a2-unified-project-data-date`

إذا لم يتطابق الأساس أو كانت `main` غير نظيفة أو الاختبارات الأساسية فاشلة: توقف واكتب تقرير `BLOCKED`؛ لا تصلح مشاكل خارج A2.

## نموذج المشروع غير القابل للكسر

1. العقد الرئيسي الواحد ينشئ المشروع؛ عقد الباطن لا ينشئ مشروعًا.
2. BOQ الرئيسي هو مرجع الكمية والسعر، وبند الباطن مرتبط بالبند الرئيسي.
3. WIR الباطن يحمل تقدمه إلى الرئيسي مرة واحدة، لكن تكلفة الباطن تستخدم سعر عقده.
4. Baseline المعتمد مجمد. Current plan وCPM Forecast منفصلان ولا يعيدان كتابة Baseline.
5. الأرقام المالية والكميات والتقدم يجب أن تكون قابلة للتتبع إلى SQLite ومؤرخة.
6. عند غياب مصدر كافٍ تعرض `Unavailable` ولا تنشئ fallback رقميًا.

## حالة هذا الملف

هذا أمر تاريخي خاص بـA2، وهي مغلقة. **ممنوع إعادة تنفيذ A2.** نقطة الاستلام الحالية
ومواصفات التنفيذ المستمر موجودتان في:

- `docs/agent-work-orders/CLOUD_PROGRESS_LEDGER.md`
- `docs/agent-work-orders/MASTER_CLOUD_DEVELOPMENT_WORK_ORDER_AR.md`
- `docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md`
- `docs/agent-work-orders/UNIVERSAL_CLOUD_AGENT_PROMPT_AR.md`
- `docs/FEATURE_CATALOG_37_AND_CONTINUATION_AR.md`

هذا الملف لا يُرسل الآن للوكيل لأنه خاص تاريخيًا بـA2. الرسالة الوحيدة الجاهزة
للبدء والاستمرار هي `UNIVERSAL_CLOUD_AGENT_PROMPT_AR.md`.

## الميزة المطلوبة فقط

**A2 — Unified Project Data Date**: إنشاء مصدر حالة واحد على مستوى التطبيق لتاريخ القياس المختار للمشروع، ثم تمريره إلى المستهلكين بدل استعمال `new Date()` أو state مستقل داخل كل شاشة.

### الوضع الحالي المثبت

- `Dashboard.tsx` يملك `asOfDate` محليًا.
- `ReportPack.tsx` يملك `reportDate` محليًا مختلفًا.
- `App.tsx` وبعض إجراءات PMO/Portfolio تستخدم تاريخ اليوم مباشرة.
- Control Accounts لديها `data_date` خاص بالسجل ولا يجوز تغييره بصمت.
- دوال `evm.ts`, `pmoSnapshot.ts`, `cashForecast.ts`, `projectControlAnalytics.ts` تقبل تاريخًا صريحًا بالفعل.

## نطاق التنفيذ المرحلي

نفذ **A2.1 فقط** في هذا الفرع:

1. إنشاء context/hook خفيف لـ`projectId + dataDate` مع تاريخ ISO صالح.
2. يكون التاريخ الافتراضي اليوم محليًا، ويمكن للمستخدم تغييره من مكان واحد ظاهر.
3. تمرير التاريخ نفسه إلى Dashboard وReport Pack دون state تاريخ مستقل داخلهما.
4. عدم تغيير approved snapshots أو Control Account record dates تلقائيًا.
5. توضيح في UI أن التاريخ هو reporting cut-off وليس تاريخ تعديل البيانات.
6. إضافة اختبارات تثبت أن مستهلكين مختلفين يستقبلان نفس التاريخ وأن تغييره لا يكتب أي سجل.

## ملفات مستهدفة مسموحة

- `src/App.tsx`
- `src/components/Dashboard.tsx`
- `src/components/ReportPack.tsx`
- ملف context/hook جديد واحد تحت `src/context/` أو `src/hooks/`
- اختبار جديد واحد أو تعديل اختبار متعلق بتاريخ التقرير تحت `tests/`

أي ملف آخر يحتاج موافقة Codex. ممنوع تعديل migrations أو Rust أو repositories أو package dependencies في A2.1.

## معايير القبول

1. تغيير Data Date مرة واحدة يغيّر Dashboard وReport Pack إلى القيمة نفسها.
2. Refresh لا يعيد التاريخ إلى قيمة مختلفة داخل الشاشة نفسها خلال الجلسة.
3. كل cumulative KPI يستبعد facts بعد التاريخ المحدد وفق منطق الدوال الحالية.
4. لا يتم تعديل Baseline أو Schedule planned dates أو WIR أو cost/cash rows.
5. لا توجد أرقام mock أو fallback جديد.
6. `npm test` و`npm run build` ينجحان.
7. يوجد اختبار سلبي لتاريخ فارغ/غير صالح، واختبار عدم الكتابة إلى repository.

## الممنوعات

- لا تبدأ A3 أو C2 أو XER أو roles أو permissions.
- لا تعيد تصميم App أو Dashboard.
- لا تضف مكتبة state management أو dependency.
- لا تغير schema أو بيانات الاختبار المرجعية لأجل تمرير الاختبار.
- لا تحذف tests ولا تخفض شروطها.
- لا تدّعي 8/10 أو اكتمال A2؛ هذا قرار Codex بعد المراجعة.

## خطوات التنفيذ والتسليم

1. اكتب قبل التعديل تقرير فهم قصير يحدد مواضع التواريخ المستقلة التي وجدتها.
2. نفذ patch صغيرًا ومترابطًا.
3. شغّل `npm test` ثم `npm run build`.
4. افحص `git diff --check` و`git status --short`.
5. اكتب `docs/agent-results/A2_1_RESULT.md` متضمنًا الملفات، الاختبارات، القيود، وأي نقطة غير مكتملة.
6. commit واحد بعنوان `feat(a2): unify project reporting data date`.
7. push للفرع `agent/a2-unified-project-data-date` فقط.
8. لا تفتح merge تلقائيًا ولا تعدل `main`. أرسل إلى المستخدم رابط الفرع وhash الـcommit ونتائج الاختبارات.

## ما سيراجعه Codex عند العودة

- عدم وجود أي مصدر تاريخ مستقل بقي في Dashboard/Report Pack.
- عدم إدخال write side-effects داخل context.
- صحة التاريخ مع project switching.
- تطابق totals قبل/بعد التاريخ مع source rows.
- الاختبارات والبناء ومراجعة Ollama، ثم يقرر الدمج أو الرفض.
