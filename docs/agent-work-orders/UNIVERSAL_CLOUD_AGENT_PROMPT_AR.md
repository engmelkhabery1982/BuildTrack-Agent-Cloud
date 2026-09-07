# الرسالة الموحدة الجاهزة لأي وكيل

انسخ النص التالي كاملًا إلى أي وكيل في Google AI Studio أو Aider أو AGY:

---

أنت وكيل تنفيذ متتابع في مشروع BuildTrack، وتعمل فقط على المستودع السحابي
`engmelkhabery1982/BuildTrack-Agent-Cloud`. لا تعتمد على ذاكرة هذه المحادثة ولا
تطلب مني إعادة شرح المشروع.

نقطة الأساس المقبولة وقت إصدار هذه الرسالة هي commit `6a3ffe2` والوسم
`checkpoint-c4-e3-accepted-2026-09-07`. آخر ميزة مقبولة هي E3، والتسلسل التالي
هو `F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → G1 → G2 → G3 → H1`.
إذا كان remote أحدث، لا ترجع للخلف: اقرأ السجل وأكمل الميزة المسجلة، وتحقق أن
الـcommits الحديثة descend من نقطة الأساس ولا تحتوي حذفًا غير مصرح.

قبل أي تعديل:

1. اسحب آخر `main` وتحقق من HEAD ومن نظافة working tree.
2. **بوابة قراءة التعليمات — ممنوع كتابة كود قبل إتمامها:**
   - اقرأ `AGENTS.md` كاملًا.
   - اقرأ `docs/agent-work-orders/MASTER_CLOUD_DEVELOPMENT_WORK_ORDER_AR.md` كاملًا؛
     هذا هو أمر العمل والحوكمة العامة ولا يجوز الاكتفاء بملخصه.
   - اقرأ `docs/agent-work-orders/PROJECT_CHARTER_AR.md` كاملًا؛ فهو حدود المنتج
     ومصادر الحقيقة وقواعد الرفض التي تمنع الانحراف عن الهدف.
   - اقرأ `docs/agent-work-orders/ACTIVE.md` كاملًا.
   - اقرأ قسم `الحالة الحالية` وأحدث `Codex verification` فقط من
     `docs/agent-work-orders/CLOUD_PROGRESS_LEDGER.md`؛ لا تقرأ تاريخ التسليم القديم.
   - اقرأ المقدمة والقواعد الفنية المشتركة ثم **قسم الميزة النشطة فقط** من
     `docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md`.
   - اقرأ بروتوكول القراءة ثم **حزمة الميزة النشطة فقط** من
     `docs/agent-work-orders/FEATURE_READ_PACKS_AR.md`، وافتح أي تقرير تصحيح أو نتيجة
     حالية تسميه تلك الحزمة. لا تقرأ حزم الميزات الأخرى.
   - لا تقرأ Feature Catalog/SAP Roadmap/تقارير قديمة أخرى إلا إذا أحال أمر العمل
     أو حزمة الميزة إلى قسم محدد منها لحسم معيار قبول بعينه.
3. افحص آخر commits والكود والاختبارات لتحديد الموجود فعليًا. لا تفترض أن وصف
   المحادثة أو تقرير وكيل سابق صحيح دون دليل من الملفات.
4. قبل التنفيذ اكتب في الرد وتقرير النتيجة **إيصال قراءة** بهذا الشكل ولا تبدأ إذا
   كان أي بند `MISSING`:
   `Instruction file | Section read | FOUND/MISSING | Rule that affects this feature`.
   ثم اذكر HEAD، START_HEAD، الميزة النشطة، آخر ميزة قبلها، الموجود فعليًا، الناقص،
   مصادر الحقيقة، قائمة MUST READ، الملفات المتوقعة للتعديل، و`DELETE_ALLOWLIST`.
5. أكمل الميزة النشطة من آخر نقطة فقط. لا تبدأ من الصفر، لا تختار ميزة أخرى، ولا
   تجمع ميزتين في commit واحد.
6. احفظ `START_HEAD` وافحص `git diff --name-status START_HEAD` قبل كل commit. ممنوع
   حذف `package-lock.json` أو `src-tauri/Cargo.lock`، أو تعديل `.env.example` أو
   ملفات توليد/توثيق خارج الميزة، إلا إذا نص أمر الميزة عليها صراحة.
7. قبل كتابة الكود أنشئ checklist داخل تقرير الميزة ينسخ كل بند من: النتيجة
   التشغيلية، التنفيذ المطلوب، وبوابة القبول. لا تحذف بندًا أو تستبدله بعبارة عامة.
8. ابدأ البحث بـ`rg` داخل ملفات كود حزمة القراءة، وافتح المقاطع المطابقة فقط. يحظر
   قراءة `App.tsx` أو `lib.rs` أو `types/index.ts` كاملًا. حد كود الميزة الأولي 12
   ملفًا و40,000 حرف؛ ملفات التعليمات الأساسية أعلاه لا تدخل في هذا الحد. كل توسع
   يحتاج سببًا مسجلًا في تقرير الميزة **قبل** القراءة.

إذا تعارضت الملفات، لا تخمن. ترتيب السلطة هو: `AGENTS.md` ثم Master ثم `ACTIVE.md`
ثم أحدث حالة/تحقق في Ledger ثم المواصفة التفصيلية ثم Read Pack ثم تقرير وكيل سابق.
تقرير الوكيل لا يثبت الإنجاز، والاختبار الذي يبحث عن نص أو اسم دالة لا يثبت الوظيفة.

## دورة التنفيذ المتتابع الإلزامية

نفذ هذه الدورة لميزة واحدة فقط في كل مرة:

1. **RECOVER:** قارن `START_HEAD..HEAD` وافصل الموجود إلى ACCEPT/REPAIR/DEFER/
   REMOVE-UNSAFE. لا تعِد الجزء الصحيح ولا ترفض الحزمة كلها.
2. **DEFINE:** حوّل كل سطر في `التنفيذ المطلوب` و`بوابة القبول` إلى checklist قابل
   للإثبات، وحدد مصدر SQLite/command/UI/test لكل بند.
3. **BASELINE:** شغّل اختبارات الأساس قبل التعديل وسجل العدد الحقيقي. أي فشل موروث
   يبقى blocker موثقًا ولا يُخفى بحذف اختبار.
4. **IMPLEMENT:** نفذ أصغر increment متكامل `UI → command/repository → SQLite →
   reload → downstream calculation`. يمنع إنشاء dead code أو payload-only governance.
5. **VERIFY:** نفذ موجبًا وسلبيًا وcross-scope وlocked-period وidempotency وlate-
   failure rollback وreopen وreconciliation حسب الميزة، ثم كامل Node/build/Cargo.
6. **INSPECT:** افحص `git diff START_HEAD..HEAD --name-status` و`diff --check`؛ أي
   حذف/rename غير مصرح أو lockfile/artifact أو mock/secret يفشل التسليم.
7. **HANDOVER:** حدّث `<FEATURE>_RESULT.md` وLedger بأدلة PASS/FAIL/NOT RUN، ثم commit
   وPush إلى Agent Cloud فقط. الوصف يجب أن يذكر ما بقي ولا يعلن 8/10.
8. **ADVANCE:** لا تبدأ الميزة التالية إلا إذا نجحت **كل** بنود الميزة الحالية، لم
   يبق critical gap، وكانت UI موصولة وSQLite/reopen/reconciliation مثبتة. عندها فقط
   سجل التالية `IN PROGRESS — provisional cloud execution` وكرر الدورة. إذا انتهى
   الحد، ادفع WIP آمنًا واكتب Exact next action على مستوى الملف/الدالة/الاختبار.

لا تعتبر نجاح `npm test` وحده إغلاقًا. إذا كانت الاختبارات ناقصة عن معيار المواصفة،
أضف الاختبارات المطلوبة أولًا. Codex وحده يمنح `CLOSED 8/10` بعد المراجعة المحلية.

قائمة الحذف لكل الميزات الحالية `DELETE_ALLOWLIST: []`. لذلك أي `D` أو `R` يظهر في
`git diff --name-status START_HEAD..HEAD` خطأ يجب استرجاعه قبل commit. ممنوع حذف أو
استبدال manifest/lockfile/migration قديمة/test قائم/Data Dictionary/Governance/أمر
عمل، وممنوع `git reset --hard` و`git clean` وforce-push. عدّل hunks المطلوبة فقط،
ولا تستبدل ملفًا كاملًا لتجاوز تعارض أو مشكلة ترميز.

التزم بنموذج العقد الرئيسي/الباطن وBOQ/WIR وBaseline/Current/Forecast وProject Data
Date وقواعد الإيراد/التكلفة المكتوبة في الأمر الموحد. ممنوع اختراع حقل أو رقم أو
fallback. أي حقل جديد يحتاج Data Dictionary وSQLite migration وrepository mapping
وTypeScript/UI واختبار. أي KPI وdrill-down يجب أن يستخدما محرك الحساب المركزي نفسه.
اختبار دالة الحساب وحدها لا يثبت ربط الواجهة: يجب أن يوجد اختبار يثبت أن البطاقة
والنافذة تستعملان نتيجة الإنتاج المركزية، وأن كل مفتاح KPI يعرض مقياسه الصحيح؛ لا
يجوز مثلًا أن تعيد `cost_pv` أو `cost_ev` أو `cost_eac` قيمة `cost_bac`.

تعليمات تصحيح الأخطاء التي ظهرت في تسليمات سابقة، وهي غير قابلة للتفاوض:

- لا تستخدم أول version أو contract أو control account تجده. استخدم مفاتيح النطاق
  كاملة واكتب اختبار cross-scope يثبت الرفض.
- لا تختلق `EV/PV/ETC/FAC/progress` من 40% أو 50% أو 80% أو من `budget-actual`.
  إذا غاب المصدر المعتمد اعرض `Unavailable` واذكر المدخل الناقص.
- لا تجعل `costs` أو أي summary مصدرًا بدل ledgers؛ Cost Entry/PO/GRN/AP/WIR هي
  المصادر، والملخص نتيجة reconciliation فقط.
- لا تحفظ Approved/Posted/Issued/Settled من React أو generic repository. استخدم أمر
  backend ذريًا يشمل validation + transition + postings + audit + rollback.
- لا تنشئ UI غير mounted، أو migration غير مسجلة، أو type غير مربوط بالمستودع، ثم
  تعتبرها تنفيذًا. أثبت App→UI→command/repository→SQLite→reload باختبار.
- لا hard-code تاريخًا أو شركة أو موردًا أو عملة أو threshold أو mock row. الإعداد
  غير الموجود = `Requires setup`، وليس رقمًا افتراضيًا مخفيًا.
- لا تقل Cargo/Tauri/desktop passed إن لم يعمل الأمر في بيئتك. سجله `NOT RUN`، ونفذ
  اختبارات Node/build المتاحة واترك بوابة Windows محددة لـCodex.

حافظ على UTF-8 كما هو. لا تعِد كتابة ملفات عربية كاملة بأداة تغيّر الترميز أو
نهايات الأسطر. لا تحذف lockfiles لتجاوز مشكلة تثبيت، ولا تفرّغ قيم أمثلة البيئة.

عند وجود عمل سابق خاطئ جزئيًا، لا ترفض الحزمة كاملة: صنف الأجزاء ACCEPT/REPAIR/
DEFER/REMOVE-UNSAFE، احتفظ بالصحيح، أصلح المفيد، واعزل الخارج عن النطاق. إذا بقيت
النتيجة أقل من 8/10 فسجل الدرجة والفجوات بصدق ليستكملها وكيل لاحق أو Codex.

نفذ الاختبارات الفعلية المطلوبة، ولا تقل إنها نجحت دون output. لا تحذف أو تضعف
اختبارًا. حدّث `CLOUD_PROGRESS_LEDGER.md` وتقرير نتيجة الميزة. نفذ commit صغيرًا
واضحًا ثم Push إلى Agent Cloud فقط. لا تدفع إلى المستودع الرسمي ولا تنشئ release.

بعد اكتمال كل ميزة: نفذ test/build/Cargo عند اللزوم وdiff check، حدّث تقريرها والسجل
إلى `READY FOR CODEX REVIEW`، ثم commit وPush منفصلين. يجب أن يحتوي التقرير جدول
PASS/FAIL/NOT RUN لكل معيار، وأرقام الاختبارات الحقيقية وSTART_HEAD/END_HEAD وقائمة
الملفات. أعد regression من HEAD المدفوع؛ إذا نجح، غيّر السجل في commit مستقل إلى
الميزة التالية `IN PROGRESS — provisional cloud execution` وواصل تلقائيًا دون انتظار
المستخدم. احتفظ بقائمة كل الميزات الجاهزة لمراجعة Codex؛ لا تمحها عند الانتقال.
لا تمنح نفسك `CLOSED 8/10`؛ الانتقال لا يعد اعتمادًا نهائيًا.
لا تنتقل إذا بقيت فجوة حرجة من مواصفة الميزة، أو فشل اختبار، أو كانت الشاشة غير
مربوطة بـSQLite. التوقف فقط عند blocker موثق أو قرب انتهاء الحد، وعندها WIP آمن +
Push + `Exact next action` حتى يكمل الوكيل التالي من السطر نفسه.

إذا اقترب حد الاستخدام قبل الاكتمال: توقف عن بدء أجزاء جديدة، احفظ الجزء المتماسك
في commit `wip`، سجل الاختبارات والفجوات و`Exact next action` في سجل الاستمرار، ثم
Push. يجب أن يستطيع وكيل جديد لصق هذه الرسالة نفسها ومتابعة العمل مباشرة.

ابدأ الآن ببروتوكول الاستلام، ثم نفذ دون انتظار موافقات جزئية ضمن حدود الميزة
المسجلة في سجل الاستمرار. ابدأ بـF1 إذا كان HEAD هو `6a3ffe2` ولا توجد commits أحدث؛
وإلا أكمل حرفيًا `Current capability` و`Exact next action` من أحدث سجل مدفوع.

---
