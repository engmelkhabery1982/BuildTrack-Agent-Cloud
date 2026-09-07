# BuildTrack — أمر العمل السحابي الموحد لجميع الوكلاء

## 1. السلطة والهدف

أنت وكيل تنفيذ مؤقت تحت مراجعة Codex. الهدف هو تطوير وظائف التحكم التشغيلي في
المشروع إلى مستوى عملي يقارب الوظيفة المقابلة في SAP PS بدرجة 8/10 داخل النطاق،
مع أرقام وعلاقات قابلة للتدقيق. لا تدّعي أن BuildTrack يطابق SAP ERP كاملًا.

تعمل فقط على:

`https://github.com/engmelkhabery1982/BuildTrack-Agent-Cloud`

لا تدفع إلى المستودع الرسمي، لا تنشر release، لا تعدّل بيانات مستخدم حقيقية، ولا
ترفع secrets أو قواعد SQLite أو `node_modules` أو `dist` أو `target` أو ZIP/PATCH.

## 2. بروتوكول الاستلام — إلزامي لكل وكيل وكل نموذج

نفذ هذا قبل اقتراح أو تعديل أي كود:

1. Pull آخر `main` من Agent Cloud وتحقق من HEAD وworking tree.
2. لا تقرأ المشروع أو المراجع كاملة. اقرأ `AGENTS.md`، ثم قسم الحالة الحالية فقط
   من `docs/agent-work-orders/CLOUD_PROGRESS_LEDGER.md`، ثم قسم الميزة النشطة فقط
   من `docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md`، ثم حزمة
   `MUST READ` الخاصة بها في `docs/agent-work-orders/FEATURE_READ_PACKS_AR.md`.
   لا تفتح Charter أو Feature Catalog أو SAP Roadmap أو تقارير قديمة إلا إذا سمت
   حزمة الميزة الملف/القسم صراحة. ابحث بـ`rg` وافتح المقاطع المطابقة فقط.
3. افحص آخر 10 commits وأي diff غير مكتمل للميزة النشطة.
4. شغّل اختبارات الأساس قبل التعديل. إذا كانت فاشلة، سجل الفشل ولا تخفّض اختبارًا.
5. اكتب في رد البداية: HEAD، الميزة النشطة، الموجود منها، الناقص، الملفات المتوقعة،
   ومصدر الحقيقة. لا تطلب من المستخدم إعادة شرح المشروع.
6. أكمل الميزة المسجلة في `CLOUD_PROGRESS_LEDGER.md` من آخر نقطة. ممنوع اختيار ميزة
   أخرى أو إعادة عمل جزء موجود لأن محادثتك لا تتذكره.
7. الحد الأولي للقراءة 12 ملفًا و40,000 حرف. قبل تجاوزه سجل في تقرير الميزة اسم
   الرمز والملف الإضافي وسبب عدم كفاية حزمة القراءة. فتح `App.tsx` أو `lib.rs` أو
   `types/index.ts` كاملًا مخالفة لأمر العمل.

عند اختلاف حالة قديمة في Roadmap أو تقرير سابق، يكون ترتيب السلطة:
`CLOUD_PROGRESS_LEDGER.md` ثم هذا الأمر ثم `ACTIVE.md` ثم Feature Catalog ثم Roadmap.
تُستخدم Roadmap لتعريف القدرة ومعيارها، لا لتجاوز حالة الاستمرار الأحدث.

## 3. نموذج العمل غير القابل للكسر

1. عقد رئيسي واحد ينشئ مشروعًا واحدًا. عقد الباطن يتبع الرئيسي ولا ينشئ مشروعًا.
2. BOQ الرئيسي هو مرجع نطاق وكمية وسعر العميل. بند الباطن مرتبط ببند رئيسي.
3. كمية وتقدم الباطن يحملان مرة واحدة إلى الرئيسي؛ تكلفة الباطن تستخدم سعر/تكلفة
   عقده، بينما قيمة تقدم العميل تستخدم سعر البند الرئيسي.
4. Variation المعتمد يضيف سطر نطاق/كمية/سعر/زمن قابلًا للتتبع، ولا يمحو الأصل.
5. Baseline المعتمد مجمد. Current وForecast منفصلان ولا يعيدان كتابة Baseline.
6. Project Data Date هو cut-off واحد للتحليل؛ لا يغير السجلات المصدرية.
7. كل رقم مالي أو كمية أو تاريخ يجب أن يعود إلى صفوف SQLite محددة وحالة اعتماد.
8. عند غياب مصدر كافٍ اعرض `Unavailable / Requires data` ولا تخترع صفرًا أو fallback.
9. أسماء الحقول تتبع Data Dictionary. الحقل الجديد يتطلب تعريفًا وSQLite migration
   وrepository mapping وTypeScript/UI واختبار migration؛ ممنوع حقل JSON خفي فقط.
10. لا تكرر الحساب داخل Dashboard/modal/test. استخدم دالة إنتاج مركزية تعيد الإجمالي
    وصفوف المساهمة حتى يكون drill-down مطابقًا للبطاقة.

### 3.1 أنماط فشل شوهدت فعليًا وممنوعة صراحة

- ممنوع اختيار `find()` لأول version/contract/control account في المشروع ثم استعماله
  لنطاق آخر. كل lookup يجب أن يثبت المفتاح المركب الكامل، وتوجد له حالة اختبار سلبية.
- ممنوع توليد ETC/EV/PV/progress من نسب افتراضية أو `budget - actual` لإخفاء غياب
  Forecast معتمد. الغياب يعرض `Unavailable` مع سبب.
- ممنوع اعتبار جدول summary مثل `costs` مصدرًا عندما توجد Cost Entries/PO/GRN/AP/
  WIR ledgers. الملخص مشتق ويجب أن يتطابق مع المصدر، لا أن ينافسه.
- ممنوع حفظ status معتمد أو Posted أو Issued عبر generic insert/update ثم تنفيذ آثار
  جانبية من الواجهة. الانتقال وآثاره وaudit داخل transaction backend واحدة.
- ممنوع إنشاء مكون أو utility أو migration دون توصيله إلى App/useData/repository/
  command registration ومسار UI فعلي، ثم الادعاء بأن الميزة اكتملت.
- ممنوع كتابة اختبار يبحث عن اسم دالة فقط كدليل وظيفي وحيد. يلزم اختبار حساب/معاملة
  فعلي، واختبار wiring إضافي عند الحاجة.
- ممنوع نسخ الأرقام أو mock rows إلى Dashboard/Report/Cockpit، أو hard-code مورد أو
  تاريخ أو عملة أو materiality threshold. الإعداد غير الموجود يبقى `Requires setup`.
- ممنوع تعديل migration سابقة أو استخدام payload JSON لإخفاء علاقة/حالة حاكمة.
- ممنوع إعلان Cargo أو desktop acceptance ناجحًا في بيئة لا تحتوي Cargo/Tauri.
  سجله `NOT RUN — pending Codex Windows gate` ولا تزور النتيجة.
- ممنوع تحديث `Last accepted capability` أو وضع ✅ أو 8/10. الوكيل يكتب فقط
  `READY FOR CODEX REVIEW`، وCodex يراجع ويصحح ويعتمد.

## 4. سياسة إنقاذ العمل وعدم رفض الحزمة كاملة

عند استلام عمل وكيل سابق، صنف كل ملف أو hunk إلى:

- `ACCEPT`: صحيح ومتكامل.
- `REPAIR`: مفيد لكن يحتاج تصحيحًا قبل القبول.
- `DEFER`: صحيح لكنه خارج الميزة الحالية؛ يحتفظ به في commit منفصل ولا يدمج الآن.
- `REMOVE-UNSAFE`: mock أو رقم مخترع أو secret أو artifact أو كود يفسد الحوكمة.

لا تحذف الحزمة كلها بسبب عيب جزئي. أصلح واحتفظ بالمفيد. إذا انتهت الميزة دون 8/10،
سجلها `PARTIAL — <score>/10` مع فجوات دقيقة، ولا تزور علامة النجاح. Codex يراجع
ويصحح ويقرر الدمج الرسمي النهائي.

## 5. قواعد Git والتسليم

- العمل متسلسل على `BuildTrack-Agent-Cloud/main` لتوافق Google AI Studio GitHub Sync.
- وكيل واحد يكتب في اللحظة نفسها. قبل كل جلسة: Pull. بعد كل وحدة: test ثم commit ثم Push.
- لا تستخدم force-push ولا تعيد كتابة history.
- ميزة واحدة في كل commit/سلسلة commits مترابطة؛ لا تجمع ميزتين في commit واحد.
- عناوين commits: `feat(a3): ...`، `test(a3): ...` أو `wip(a3): ...` عند انقطاع الحد.
- حدث `CLOUD_PROGRESS_LEDGER.md` في آخر commit لكل جلسة.
- Codex وحده ينقل المحتوى إلى المستودع الرسمي بعد المراجعة والإصلاح.
- سجّل `START_HEAD` وافحص نطاق الفرق قبل التسليم. لا تحذف `package-lock.json` أو
  `src-tauri/Cargo.lock`، ولا تعدّل `.env.example` أو سكربتات/وثائق خارج الميزة
  لمعالجة قيود بيئة الوكيل. أي تغيير مساعد خارج النطاق يوضع في commit منفصل ويُؤجل.
- حافظ على ترميز UTF-8 للوثائق العربية؛ ظهور نص مشوه أو تغيير ملف كامل بسبب
  الترميز/نهايات الأسطر فشل تسليم.
- عند `READY FOR CODEX REVIEW` نفذ Commit وPush، ثم شغّل اختبارات الأساس على HEAD
  المدفوع. إذا نجحت ولم توجد فجوة حرجة، سجّل الميزة التالية `IN PROGRESS` في commit
  مستقل وواصل دون انتظار المستخدم. انتقال الوكيل **مؤقت للتنفيذ المتتابع** ولا يعني
  أن السابقة `CLOSED 8/10`؛ Codex وحده يمنح الإغلاق النهائي بعد المراجعة.
- المكوّن الجديد غير المستورد والمُrender من مسار إنتاج فعلي يعتبر **Dead Code وفشلًا**؛
  يجب إثبات الوصول إليه باختبار تكامل. لا يكفي إنشاء ملف UI أو إضافته إلى TypeScript.
- لا تضع metadata أو حالات أو snapshots حاكمة داخل `payload` فقط: أنشئ أعمدة SQLite
  صريحة وrepository mapping للقراءة والكتابة واختبر الإغلاق وإعادة الفتح.
- قارن دائمًا `git diff START_HEAD..HEAD`، لا آخر commit فقط؛ أي حذف lockfile أو تغيير
  موروث خارج الميزة يجب إصلاحه قبل التسليم. لا تعدّل سطر `Last accepted capability`
  ولا تعلن تقييمًا أو `CLOSED`؛ اكتب `READY FOR CODEX REVIEW` فقط.
- **قائمة الحذف محظورة افتراضيًا:** لا تحذف أو تعيد تسمية أي ملف متتبع إلا إذا ورد
  مساره حرفيًا تحت `DELETE_ALLOWLIST` في مواصفة الميزة؛ والقائمة الافتراضية فارغة.
  قبل كل commit شغّل `git diff --name-status START_HEAD..HEAD`، وأي سطر `D` أو `R`
  غير مصرح به يعاد فورًا من HEAD. يحظر خصوصًا حذف/استبدال: `package.json`،
  `package-lock.json`، `Cargo.toml`، `Cargo.lock`، `AGENTS.md`، `.gitignore`، ملفات
  migrations السابقة، أي test قائم، ملفات Data Dictionary/Governance، وأوامر العمل.
- لا تستخدم `git reset --hard` أو `git clean` أو force-push أو حذفًا جماعيًا. لا تمس
  `.git` أو قواعد `*.db` أو النسخ الاحتياطية أو بيانات المستخدم. عند تعارض ملف، أصلح
  hunk المطلوب فقط؛ لا تستبدل الملف الكامل بنسخة مولدة أو مختصرة.
- لا تعدّل migration مطبقة لتغيير معناها؛ أضف migration جديدة متسلسلة، واختبر قاعدة
  جديدة وقاعدة مرت عليها النسخ السابقة. لا تغيّر dependency/lockfile إلا لضرورة
  مثبتة في الميزة ومع اختبار build؛ قيود بيئة السحابة ليست سببًا للتغيير.

## 6. بوابة القبول المشتركة

لا تسجل `READY FOR CODEX REVIEW` إلا إذا توفر:

1. معايير قبول مكتوبة واختبار موجب واختبار سلبي واختبار reconciliation.
2. `npm test` ناجح دون حذف أو إضعاف اختبار.
3. `npm run build` ناجح.
4. `cargo test --manifest-path src-tauri/Cargo.toml` عند لمس Rust/SQLite/migrations.
5. `git diff --check` ناجح وworking tree نظيفة بعد commit.
6. تقرير `docs/agent-results/<FEATURE>_RESULT.md` يذكر ما نفذ وما لم ينفذ فعلًا.
7. لا توجد أرقام mock أو schema assumptions أو ملفات مولدة.
8. اختبار تكامل يثبت أن عنصر الواجهة الفعلي يقرأ قيمة دالة الإنتاج المركزية، لا
   نسخة حساب أخرى؛ واختبار تمييز لكل KPI متشابه (BAC/PV/EV/EAC).

## 7. قائمة التنفيذ بالترتيب

### A3 — فصل Revenue/Progress Value عن Delivery Cost

**الهدف:** منع استعمال سعر العميل أو EV الإيرادي كمؤشر لكفاءة تكلفة التنفيذ.

**مصادر الحقيقة:** الإيراد من العقد الرئيسي وBOQ/SOV المعتمد؛ تكلفة الخطة من
Cost Control/Control Account/CBS/approved cost plan الحقيقي؛ AC من قيود التكلفة
المؤرخة المقبولة؛ commitment من PO المفتوح المقبول.

**المطلوب:**

- جرد فعلي لحقول الميزانية والتكلفة الموجودة قبل إنشاء حقل.
- تعريف Revenue BAC/PV/EV وDelivery Cost BAC/PV/EV/AC/ETC/EAC وMargin بوضوح.
- عدم استخدام Revenue BAC في Cost EAC.
- إذا لا توجد تكلفة خطة معتمدة، تعرض مؤشرات التكلفة `Unavailable` لا سعر البيع.
- ربط Dashboard وControl Account وReport Pack بنفس محرك الحساب.
- حوكمة سالب/غياب التكلفة وتواريخ ما بعد Data Date.

**قبول 8/10:** مشروع له selling rate مختلف عن cost plan يثبت فصل المؤشرين؛ مشروع
بلا cost plan لا يعطي forecast تكلفة مخترعًا؛ كل totals تطابق مصادرها.

### A4 — KPI Source Drill-down & Reconciliation

**الهدف:** كل بطاقة رئيسية تفتح صفوف المصدر التي تكوّن الرقم نفسه.

**المطلوب:** دوال مركزية تعيد `{value, contributions, exclusions, basis}` لـContract,
Variation, PV, EV, AC, Commitment, Cash وForecast؛ filter المشروع والعقد وData Date
وحالة الاعتماد؛ مجموع contributions يساوي البطاقة ضمن 0.01؛ عرض سبب الاستبعاد؛ لا
تعاد كتابة معادلات مستقلة داخل modal.

**قبول 8/10:** اختبارات تستدعي دالة الإنتاج المستخدمة فعليًا في البطاقة والنافذة،
وتكشف اختلاف المشروع أو التاريخ أو status أو duplicate.

### C2 — Schedule Versions, Scenarios & Comparison

**الهدف:** مقارنة Baseline/Current/Forecast دون خلط أو مسح التاريخ.

**المطلوب:** كيان SQLite للنسخة metadata + activity snapshot/distribution snapshot؛
حالات Draft/Approved/Superseded؛ revision وowner/data date/reason؛ مقارنة added,
removed, changed dates/duration/logic/float/critical path؛ منع تعديل approved snapshot؛
واجهة مقارنة وdrill-down.

**قبول 8/10:** حفظ نسختين وإعادة فتحهما، مقارنة دقيقة، baseline immutable، ولا تؤثر
المقارنة على current schedule.

**تفصيل إلزامي يمنع التنفيذ الناقص:** أعمدة SQL فعلية للكود/النوع/الحالة/revision/
data date/owner/reason والـsnapshots؛ uniqueness داخل المشروع والعقد؛ دورة Draft →
Approved → Superseded مع منع تعديل/حذف المعتمد؛ اختيار project/main contract صريح؛
التقاط activities وtime-phased distributions داخل النطاق فقط؛ مقارنة added/removed،
البداية والنهاية والمدة والميزانية والمنطق وtotal/free float والمسار الحرج؛ زر قابل
للوصول من Schedule؛ حفظ عبر repository ثم إعادة التحميل؛ واختبارات سلبية للنطاق
والتاريخ والتكرار والعبث وعدم تغيير Current.

### C3 — Delay & Time-Impact Register

**الهدف:** تحويل التأخير من لون إلى سجل قرار قابل للتدقيق.

**المطلوب:** delay event مرتبط بالمشروع/العقد/WBS/activity/variation؛ تاريخ اكتشاف،
سبب، مسؤول، entitlement، أيام مطلوبة/معتمدة، mitigation، status؛ حساب أثر قبل/بعد
على CPM؛ time impact المعتمد فقط يعدل contract forecast/revised finish ولا يغير baseline.

### C4 — Governed Primavera Reconciliation

**الهدف:** استيراد XER/Primavera تحديثًا محكومًا لا نسخ صفوف.

**الحالة عند HEAD المرجعي `9edb10c`:** الأساس مدمج: نطاق حقيقي، diff، سياسات
duplicate، رفض الملف الفارغ، وحفظ schedule rows/updates عبر `commitGovernedImport`.
لا تعِد كتابة هذه الأجزاء. ابدأ من الفجوات التالية فقط.

**المطلوب التفصيلي للإغلاق:**

1. استخرج من XER: PROJECT/PROJWBS/CALENDAR/TASK/TASKPRED/RSRC/TASKRSRC وبيانات
   التوزيع المتاحة، مع تحويل duration/lag باستخدام hours-per-day للتقويم الصحيح،
   والحفاظ على Source IDs منفصلة عن الأكواد المرئية المتكررة.
2. اعرض Preview قبل الحفظ في أقسام Activities، Relationships، WBS، Calendars،
   Resources/Assignments؛ وكل صف يحمل action صريحًا Insert/Refresh/Skip/Conflict
   وسببًا. لا تعرض «نجاح» قبل عودة نتيجة المعاملة من SQLite.
3. طابق WBS والتقويم والمورد بأكواد محكومة داخل المشروع/العقد؛ أنشئ فقط المفقود
   كـ`auxiliaryRows` من الأنواع التي يدعمها backend. اربط schedule rows بـ`wbs_id`
   و`calendar_id`، واربط assignments بـ`schedule_id/resource_id` داخل نفس batch.
4. Refresh يسمح بتغيير planning fields المعتمدة فقط: plan dates/duration/logic/
   constraints/calendar/WBS/resource plan. يمنع scope/code/BOQ quantity وactual dates/
   progress/EV/AC/WIR من التعديل. اكتب اختبارًا يفشل لو حاول patch تغيير actual.
5. العلاقات المتعددة FS/SS/FF/SF والـlag تحفظ كـIDs محلية قابلة لـCPM بعد حل الأكواد؛
   predecessor مفقود أو cycle يظهر Conflict ولا يمر commit دون سياسة معالجة واضحة.
6. الأنشطة بلا BOQ تعامل `is_non_boq_activity=true` ولا تختلق كمية أو وحدة أو تكلفة.
   النشاط المرتبط بـBOQ يجب أن يمر حوكمة الكمية ولا يتجاوز المتبقي.
7. Commit واحد ذري يشمل masters/activities/relationships/assignments/audit batch؛
   أي خطأ متأخر يعيد كل الصفوف. وفر Reversal من batch audit يعيد inserts والتحديثات
   والـauxiliary rows دون حذف actual history.
8. Excel: استخدم قارئ XLSX الحقيقي، اعرض أسماء الشيتات عند التعدد، ثم mapping preview؛
   ممنوع قراءة binary Excel بـ`FileReader.readAsText`. إذا لم ينفذ كاملًا لا تعرض
   `.xlsx/.xls` في accept ولا تدّعمه في التقرير.
9. Export Reviewed XER يجب أن يحافظ على IDs/relations/calendars واختبار parse→export→
   parse يثبت counts والروابط والمدد والlags. لا تسمه P6 round-trip إن فقد masters.
10. اختبارات القبول: XER واقعي فيه WBS متداخل وتقويم استثناءات وعلاقات متعددة وموارد
    وكود نشاط مكرر؛ اختبار refresh يحافظ على actuals؛ duplicate بكل سياسة؛ missing
    predecessor/cycle؛ cross-scope؛ late failure rollback؛ reversal؛ إعادة تحميل SQLite؛
    وتكامل UI يثبت أن زر Commit يستدعي البوابة الذرية ثم reload.

**مصادر الحقيقة/الملفات المتوقعة:** `src/data/primaveraImport.ts`،
`src/utils/primaveraReconciliation.ts`، `src/components/XerReconciliationBoard.tsx`،
`src/data/governedImport.ts`، `src-tauri/src/import_batch.rs`، اختبارات C4 ووثيقتها.
تعديل غيرها يحتاج تبريرًا في التقرير. `DELETE_ALLOWLIST: []`.

**قبول الوكيل قبل الانتقال:** كل النقاط أعلاه مطبقة أو يسجل Blocker خارجي مثبت؛
`npm test` وbuild وCargo tests وdiff check ناجحة، وResult يطابق الواقع. لا يجوز تجاوز
C4 إلى D1 إذا بقي commit زرًا شكليًا أو بقيت masters/assignments غير محفوظة.

### D1 — Time-phased Cost Plan by Control Account

**الهدف:** توزيع ميزانية تكلفة التنفيذ زمنيًا ومقارنتها بالواقع.

**المطلوب:** approved cost-plan version؛ periods مرتبطة Data Date/calendar؛ طرق توزيع
linear/front/back/bell/manual؛ reconciliation حتى cent؛ roll-up WBS/CBS/BOQ/Control
Account؛ فصل cost plan عن revenue PV وعن cash.

### D2 — Forecast Methods & Estimate Versions

**الهدف:** ETC/FAC محكومان بدل معادلة واحدة مخفية.

**المطلوب:** طرق Bottom-up، Remaining Budget، CPI، CPI×SPI وManual governed؛ version,
owner, data date, assumptions, approval؛ floor لا يقل عن AC + open commitment عند
اللزوم؛ مقارنة forecast revisions وسبب التغيير.

### D3 — Commitment-to-Actual Reconciliation

**الهدف:** PO → GRN → Supplier Invoice → Payment دون مضاعفة التكلفة أو النقدية.

**المطلوب:** state transition ومبلغ open commitment وaccepted actual وAP payable وcash
settlement؛ partial receipt/invoice/payment؛ reversal؛ VAT/retention/advance؛ source
drill-down؛ reconciliation لكل PO/vendor/period.

### D4 — Cost Variance Drill-down

**الهدف:** تحليل الانحراف حسب WBS/CBS/vendor/period وسبب قابل للتصرف.

**المطلوب:** budget/commitment/actual/ETC/FAC variance tree؛ usage/rate/mix/productivity
فقط عندما تتوفر quantities/rates الموثوقة؛ منع تصنيف كل التكلفة كمقاول باطن؛ totals
بين Cost Entries وCost Control متطابقة دون duplicate.

### E1 — Integrated Project Controls Cockpit

**الهدف:** شاشة قرار واحدة حسب Project + Data Date + Control Account.

**المطلوب:** Scope/Quantity/Schedule/Cost/Progress/Cash/Change/Quality؛ تعريف ومصدر
لكل KPI؛ استثناءات مرتبة بالمادية؛ drill-down؛ لا تجمع مقاييس غير متجانسة في total.

### E2 — Persistent Variance Action Register

**الهدف:** ربط الانحراف بإجراء ومالك وموعد وتصعيد.

**المطلوب:** SQLite entity، source KPI/record، severity/materiality، owner، due date,
status، comments/evidence، audit؛ منع الإغلاق دون evidence؛ إشعار وتصعيد محلي.

### E3 — Controlled Report Pack

**الهدف:** تقرير فترة ثابت المصدر قابل للتوقيع وإعادة الإنتاج.

**المطلوب:** report version + project + Data Date + source snapshot/hash؛ Draft/Issued/
Superseded؛ sign-off؛ قالب مرن وشعار/حقول/صفحات؛ PDF/Excel؛ كل رقم reconciled إلى
المصدر؛ التقرير الصادر immutable.

### الحزمة اللاحقة بعد E3

المرجع التنفيذي الملزم هو:

`docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md`

وينفذ بالترتيب الثابت:

`F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → G1 → G2 → G3 → H1`

يحتوي المرجع لكل ميزة على النتيجة التشغيلية، مصدر الحقيقة، الكيانات والعلاقات،
المعاملات، الواجهة، الانعكاسات واختبارات القبول. النص المختصر في Feature Catalog
فهرس فقط؛ لا يكفي وحده للتنفيذ. ميزة واحدة وtest/commit/push مستقل لكل بوابة.
الذكاء الصناعي H1 يأتي أخيرًا، read-only مع مصدر كل رقم ولا يعتمد أو يعدل معاملة.

## 8. تحديث الانتقال بين الميزات

بعد إنهاء الميزة الحالية:

1. ضع نتيجتها في `docs/agent-results/`.
2. غيّر سجل الاستمرار الحالي إلى `READY FOR CODEX REVIEW`، ثم commit وPush للميزة
   منفردة. أضف صفًا في سجل التسليم ولا تغيّر `Last accepted capability`.
3. أعد تشغيل regression على HEAD المدفوع. عند النجاح سجّل الميزة التالية
   `IN PROGRESS — provisional cloud execution` في commit مستقل وواصل مباشرة دون
   انتظار رسالة جديدة. تبقى كل الميزات المتجاوزة `READY FOR CODEX REVIEW` حتى Codex.
4. لا تتوقف اختياريًا بين الميزات. التوقف مسموح فقط عند: قرب انتهاء الحد، فشل متكرر
   موثق، تعارض remote، سر/بيانات مستخدم، أو قرار معماري لا يمكن حسمه من المصادر.
   عندها نفذ WIP commit آمن + Push + `Exact next action` قبل التوقف.
5. عند دخول وكيل جديد، يكمل الحالة المسجلة ولا يعيد تفسير ترتيب الخطة.
