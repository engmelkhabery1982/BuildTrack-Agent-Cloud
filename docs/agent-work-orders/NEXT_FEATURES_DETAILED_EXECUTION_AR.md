# BuildTrack — المواصفة التنفيذية التفصيلية للميزات التالية

الإصدار: 2026-09-07  
نقطة البداية الملزمة: `checkpoint-c4-e3-accepted-2026-09-07` / commit `6a3ffe2`  
التسلسل الملزم: `F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → G1 → G2 → G3 → H1`

هذه الوثيقة هي مرجع التنفيذ التفصيلي بعد E3. لا تعيد تنفيذ C4–E3، ولا تنتقل
إلى ميزة لاحقة قبل أن تكون الحالية متماسكة، مربوطة بمسار الإنتاج، ومختبرة وفق
بوابتها. انتقال الوكيل السحابي يعني `READY FOR CODEX REVIEW` فقط؛ Codex وحده يمنح
علامة القبول النهائية ودرجة 8/10.

## القواعد الفنية المشتركة لكل الميزات

1. ابدأ بجرد الكيانات والحقول والدوال الموجودة. أعد الاستخدام ولا تنشئ جدولًا
   موازيًا يحمل نفس المعنى.
2. المصدر هو صفوف SQLite المحكومة، لا `localStorage` ولا state مؤقت ولا بيانات mock.
   الحقل الحاكم الجديد يحتاج migration جديدة، TypeScript، repository mapping،
   `useData`، واجهة، واختبار reopen/persistence.
3. كل اعتماد أو ترحيل مالي أو Posting أو Reversal يتم بأمر Tauri/Rust ذري داخل
   transaction مع idempotency key وaudit. يمنع تحويل الحالة المعتمدة بـgeneric CRUD.
4. لا تستخدم أول سجل في المشروع أو مطابقة الاسم فقط. المطابقة تكون بالمفاتيح
   `project_id + main_contract_id/contract_id + control_account_id + source_id` حسب
   الكيان، مع رفض cross-scope.
5. لا تقرأ الملخص denormalized إذا كان ledger المصدر موجودًا. أي roll-up يعيد
   `value + contributions + exclusions + basis + dataDate` ويطابق المصدر حتى 0.01.
6. لا hard-code لنسبة إنجاز أو تاريخ أو مورد أو عملة أو threshold أو 40%/50%/80%.
   عند غياب المدخل تعرض `Unavailable` وتشرح المدخل الناقص.
7. السجل المعتمد لا يحذف لتصحيح الخطأ؛ أنشئ Reversal مرتبطًا بالأصل. الفترة
   المغلقة تمنع posting بتاريخ داخلها، ولا يجوز تغيير التاريخ لتجاوز القفل.
8. الواجهة الجديدة لا تعد منجزة إلا إذا كانت مستوردة ومرئية من مسار التطبيق الفعلي،
   تحفظ ثم تعيد التحميل من SQLite، وتوجد بوابة اختبار تمنع Dead Code.
9. لا تضف dependency إلا عند ضرورة مثبتة. لا تحذف أو تستبدل ملفًا متتبعًا؛
   `DELETE_ALLOWLIST: []` لجميع الميزات أدناه.
10. بعد كل ميزة: test موجب + سلبي + reconciliation + migration/transaction عند
    اللزوم + `npm test` + build + Cargo إن توفر + diff check + تقرير نتيجة صادق.

---

# المرحلة F — Operational Actuals, Commercial Control & Assurance

## F1 — Labor Timesheet Approval & Actual-Cost Posting

### النتيجة التشغيلية

تحويل ساعات العمالة الفعلية إلى تكلفة محكومة لكل نشاط وحساب تحكم، مرة واحدة فقط،
مع دورة اعتماد وعكس كاملة، دون خلطها بالساعات المخططة أو قيمة الإنجاز الإيرادية.

### التنفيذ المطلوب

- جرد `labor_duty` و`resource_masters` و`schedules` و`control_accounts` و`cost_entries`
  أولًا، ثم اختيار توسيع الكيان القائم أو إضافة `labor_timesheets` وlines دون تكرار.
- Header: project، main contract، contractor/employer، work date، shift، crew،
  submitter، status، approval/posting/reversal metadata، source batch.
- Line: worker/resource، activity، control account، cost code، regular/overtime hours،
  regular/overtime rates، calculated amount، unit/currency، notes.
- تحقق backend من تطابق activity/control account/project/contract ومن نوع المورد Labor؛
  ومن عدم الساعات السالبة، وعدم تكرار العامل+اليوم+shift، وعدم تجاوز availability أو
  العمل في يوم غير عامل إلا override موثق، وعدم التاريخ بعد Data Date عند التقرير.
- الدورة: Draft→Submitted→Approved→Posted→Reversed. Approved/Posted frozen.
  `Post` ينشئ Cost Entry لكل line ذريًا بـ`source_type=LaborTimesheet` وsource id فريد؛
  `Reverse` ينشئ قيدًا سالبًا مرتبطًا ولا يحذف الأصل.
- UI: إدخال header ثم grid lines، اختيار العامل أولًا ثم تصفية النشاط/الحساب،
  إجمالي regular/overtime/amount، validation inline، وسجل source drill-down.
- ربط AC وD3/D4/E1/E3 من Cost Entries تلقائيًا؛ لا تعدّل `costs.actual` مباشرة.

### بوابة القبول

partial crew، overtime، duplicate worker-day، cross-project activity، inactive
resource، non-working calendar، locked period، atomic late failure، idempotent post،
reversal، reopen من SQLite، ومطابقة مجموع posted lines مع Cost Entries حتى 0.01.

## F2 — Equipment Meter, Hours & Fuel Posting

### النتيجة التشغيلية

تكلفة المعدات والوقود الفعلية قابلة للتدقيق من قراءة العداد والتشغيل، وليست إدخالًا
ماليًا مجمعًا غير مرتبط بالنشاط.

### التنفيذ المطلوب

- جرد `equipment` وresource master وcost entries؛ وحّد equipment identity ولا تنشئ
  موردًا جديدًا عند كل سجل.
- سجل يومي: project/contract/activity/control account/equipment/date/shift، meter
  start/end، operating/idle/breakdown hours، fuel quantity/rate، equipment rate، operator.
- اشتقاق hours من meter end−start مع override موثق فقط؛ end≥start، لا overlap لنفس
  المعدة، الساعات لا تتجاوز shift/calendar capacity، fuel/rates غير سالبة.
- دورة Draft→Submitted→Approved→Posted→Reversed، وأمران ذريان ينشئان قيد Equipment
  وقيد Fuel منفصلين عند اللزوم وبـsource uniqueness؛ لا duplicate invoice/source.
- UI يعرض utilization، idle/breakdown، cost contribution، واختلاف meter؛ يفلتر المعدة
  المتاحة للنطاق والتاريخ.
- ينعكس posted actual فقط على AC وD4/Cockpit/Report Pack، مع بقاء resource plan مستقلًا.

### بوابة القبول

meter rollback، overlap، capacity/calendar، partial posting، fuel-only، duplicate
post، cross-scope، locked period، late rollback، reversal وledger reconciliation.

## F3 — Claims / Potential Variation Order Workflow

### النتيجة التشغيلية

فصل المطالبة المحتملة عن أمر التغيير المعتمد، مع traceability من الإشعار والسبب
والدليل إلى التقييم ثم التحويل المحكوم إلى Variation.

### التنفيذ المطلوب

- كيان Claim/PVO وlines حقيقيان: project، main/subcontract، claim number، notice date،
  event/date، claimant/respondent party، RFI/delay/document/activity/BOQ links،
  entitlement basis، claimed/assessed/approved cost and days، status، owner، evidence.
- الدورة Draft→Notified→Submitted→Under Assessment→Assessed→Approved/Rejected→Converted.
  منع self-approval وتجاوز approval limit إن كان نظام الصلاحيات متاحًا؛ وإلا سجل
  ذلك كاعتماد محلي مؤقت واضح ولا تخترع RBAC.
- lines تفصل new item/quantity/rate/time/markup وتعيد استخدام variation line model.
- التحويل المعتمد فقط ينشئ Variation package ذريًا مرة واحدة. قبل التحويل لا يعدّل
  BOQ/SOV/Budget/Contract finish/Cash.
- حساب notice deadline من شروط العقد الفعلية إن وجدت؛ عند غيابها `Requires setup`.
- UI register + assessment workspace + source documents + difference بين claimed/
  assessed/approved + زر conversion مع preview.

### بوابة القبول

late notice، partial assessment، rejected claim، duplicate conversion، subcontract
scope، missing evidence، time-only/cost-only/mixed claim، reversal وعدم أثر قبل approval.

## F4 — Client/Subcontract Invoice & Certificate Reconciliation

### النتيجة التشغيلية

دورة شهادة دفع كاملة تفصل إيراد العميل عن تكلفة مقاول الباطن، وتجمع WIR المقبول
للبند والفترة مرة واحدة مع retention/advance/VAT/deductions والدفعات والعكس.

### التنفيذ المطلوب

- جرد client/subcontract invoices وpayment certificates القائم؛ لا تنشئ أربع جداول
  متنافسة إن أمكن توحيد header/lines مع `invoice_type` وفهارس scope.
- Wizard scope: project، contract (main للعميل/subcontract للباطن)، party، from/to،
  accepted WIR status، invoice/certificate number auto-generated editable/lockable.
- Aggregation: خمسة WIR لنفس linked main BOQ item تصبح line واحدة. Client quantity
  × main selling rate؛ Subcontract quantity × subcontract rate. لا تحمل قيمة الباطن
  كإيراد إضافي، لكن تكلفته تحمل إلى Control Account الرئيسي.
- line يحتفظ بقائمة source WIR ids، original/revised quantity cap، previous/current/
  cumulative quantity/value. يمنع double certification لنفس quantity.
- Header يحسب gross، retention، advance recovery، deductions، markup، tax، net certified،
  paid، balance. الصيغ مركزية وتستخدم contract terms الحقيقية.
- دورة Draft→Submitted→Certified/Approved→Partially Paid→Paid→Reversed. اعتماد الشهادة
  وcash forecast/payment posting ذري ومربوط بالمصدر؛ لا حذف صفوف منفردة من فاتورة مصدرة.
- back-to-back cap للبنود المرتبطة عند تفعيله صراحة، لا كافتراض مخفي.

### بوابة القبول

5 WIR aggregation، previous certificate، over-certification، retention/advance/tax/
deduction rounding، partial payment، duplicate source، client vs subcontract rates،
back-to-back، locked period، reversal، cash/AP/AR/Cost reconciliation حتى 0.01.

## F5 — Versioned Cash Forecast Assumptions

### النتيجة التشغيلية

فصل النقد المحقق عن توقع التحصيل/السداد، مع فرضيات قابلة للإصدار والمقارنة بدل
تواريخ افتراضية مخفية.

### التنفيذ المطلوب

- كيان cash forecast version وassumption/period lines: project/contract، Data Date،
  revision، owner/reason، Draft/Approved/Superseded، payment terms، lag، probability،
  date override، source type/id، expected amount/date.
- Actual Cash يأتي من settled payments فقط حتى Data Date. Forecast يأتي من unpaid
  client certificates، subcontract/supplier AP، open PO، approved variations حسب سياسة
  مكتوبة؛ لا يعتبر invoice المدفوع forecast مرة ثانية.
- كل source يشرح base date + terms + lag + probability + override. override يحتاج سببًا.
- approval/supersession ذري؛ النسخة المعتمدة frozen؛ إعادة projection تنشئ revision.
- UI timeline وجدول assumptions وwaterfall actual/forecast، overdue، lowest cash point،
  مقارنة revisions، وdrill-down لكل period/source.

### بوابة القبول

cash-in/out، partial settlement، overdue، cancellation/reversal، probability 0/100،
terms/lag، Data Date، no duplicate، closed periods وS-curve/period reconciliation.

## F6 — Governed Project Health Score

### النتيجة التشغيلية

مؤشر صحة قابل للتفسير والإصدار، لا لون مزاجي أو thresholds ثابتة داخل component.

### التنفيذ المطلوب

- versioned health configuration: dimensions Schedule/Cost/Cash/Scope/Quality/Data
  Quality، weights مجموعها 100%، warning/critical thresholds، direction، owner/reason.
- محرك مركزي يعيد component value/score/status/confidence/source/exclusions، ثم weighted
  total. Missing critical input يخفض confidence ويمنع Green؛ لا يتحول إلى صفر جيد.
- approved configuration immutable؛ واحدة Approved لكل scope؛ comparison/revision.
- Dashboard/Cockpit/Report Pack تستخدم نفس engine/config version وتعرض Data Date.
- UI configuration preview يمنع overlap/gaps/weights≠100؛ بطاقة الصحة تفتح مساهماتها.

### بوابة القبول

كل boundary، reversed direction، missing inputs، version change، cross-project config،
Data Date، contribution sum، UI-engine identity، reopen وreport reproducibility.

## F7 — Resource Leveling Decision Register

### النتيجة التشغيلية

تحويل توصية leveling إلى قرار تخطيط محكوم؛ لا يغير Baseline أو Current خفية.

### التنفيذ المطلوب

- proposal/version entities: source schedule version، Data Date، overloaded resources،
  affected activities، before/after dates/float/load، algorithm/rules، owner/status/reason.
- generator read-only يستخدم calendar/capacity/dependencies/constraints/priority ولا
  يكتب الخطة. الحالات Draft→Reviewed→Approved/Rejected→Applied→Reversed.
- Apply ينشئ Forecast schedule version جديدة ويعيد CPM؛ لا يغير approved Baseline.
- UI before/after، overload heatmap، critical/slippage impacts، reject/apply preview.

### بوابة القبول

calendar/capacity، multiple resources، critical constraints، reject no-change، apply
creates forecast، reverse، duplicate apply، CPM comparison، scope وreopen persistence.

## F8 — Persistent Report Designer

### النتيجة التشغيلية

قوالب تقارير وفواتير مرنة ومحكومة يمكن حفظها وإعادة فتحها وإصدار E3 منها.

### التنفيذ المطلوب

- template/version/section/field entities صريحة: type، scope، revision، status، page
  size/orientation، header/footer، logo attachment id، allowed fields، filters، grouping،
  totals، signatures، locale/currency/date format.
- Field registry allowlist يميز manual/source/calculated، ويمنع formula/code أو حقل غير
  مسموح. لا يخزن logo base64 ضخمًا في payload؛ يستخدم attachment metadata/path المحكوم.
- Draft→Approved→Superseded؛ issued E3 snapshot يحتفظ بنسخة القالب وقت الإصدار.
- Designer drag/order/config + preview ببيانات snapshot تجريبية محكومة، clone/version،
  invoice/client/subcontract/report pack formats.
- PDF وExcel يستخدمان نفس layout/field selection/source snapshot قدر الإمكان، مع
  إظهار الحقول غير المتاحة بوضوح.

### بوابة القبول

save/reopen، clone/version/immutability، invalid field/formula، logo missing، page
orientation، grouping/totals، manual vs calculated، E3 issue/reopen/hash/export.

## F9 — Append-only Audit Explorer

### النتيجة التشغيلية

سجل تدقيق واحد غير قابل للتعديل لكل المعاملات الحاكمة، قابل للبحث والتتبع والعكس.

### التنفيذ المطلوب

- توحيد contract للـaudit: actor/session/action/entity/entity_id/project/contract/
  control account/source batch/before/after/reason/timestamp/correlation/reversal id.
- migration/backfill غير مدمر للسجلات القائمة؛ triggers تمنع update/delete. لا secrets،
  tokens، passwords، binary أو attachment content في before/after.
- كل command حاكم F1–F8 وD/E يكتب audit داخل نفس transaction؛ فشل audit يفشل command.
- UI filters/date/project/entity/actor/action، before-after diff، deep link، CSV/Excel
  export، correlation chain وreversal link.

### بوابة القبول

tamper update/delete، rollback when audit fails، reversal chain، filters/export، scope،
large payload limits، secret redaction، reopen، وكل command حاكم له evidence row.

---

# المرحلة G — Enterprise Collaboration & Web

## G1 — Desktop/Web Hybrid Sync Protocol

### النتيجة التشغيلية

بروتوكول مزامنة قابل للتكرار والتعافي مع بقاء SQLite صالحًا offline. هذه الميزة
تصميم وتنفيذ protocol محلي/API تجريبي آمن؛ لا نشر Production ولا إدخال secrets.

### التنفيذ المطلوب

- schema mapping/version، stable UUIDs، outbox/inbox، operation id، cursor، retry count،
  checksum، dependency order، tombstone/reversal، sync status/error.
- idempotent push/pull؛ duplicate delivery لا يكرر posting. conflict policy مكتوبة لكل
  كيان: immutable approved wins/requires review، draft field conflict، attachments.
- فصل transport interface عن SQLite حتى يمكن اختبار fake server؛ credentials في secure
  runtime storage/server، لا Vite client env ولا repository.
- UI sync center: pending/failed/conflict/last success، retry، conflict resolution،
  export diagnostics منزوعة الأسرار.

### بوابة القبول

offline→online، duplicate/reordered delivery، concurrent edit، immutable conflict،
schema mismatch، interrupted batch، attachment retry، cursor recovery وno secret leak.

## G2 — Users, Roles & Segregation of Duties

### النتيجة التشغيلية

صلاحيات حقيقية في backend لكل أمر حاكم، لا مجرد إخفاء زر.

### التنفيذ المطلوب

- Users/Roles/Permissions/Assignments/Sessions/ApprovalLimits SQL. الأدوار الافتراضية:
  PMO Admin، Planner، Commercial، Cost، Field، Viewer مع permission matrix موثق.
- كل Tauri command حساس يستدعي authorization service داخل backend؛ UI يعكس القرار
  لكنه ليس الحماية الوحيدة.
- maker-checker، منع self-approval، approval limits، project/contract scope، disabled
  user/session expiry، password hashing/credential storage وفق قدرات desktop الآمنة.
- migration لأول admin لا يعيد إنشاء الحساب أو كلمة مرور افتراضية معروفة؛ setup مرة
  واحدة وتغيير/استعادة محكومة.
- audit لكل login/failure/permission/approval دون تخزين password/token.

### بوابة القبول

permission matrix command-by-command، UI bypass direct invoke، self approval، limit،
cross-project، expired/disabled session، first admin migration، password secrecy وaudit.

## G3 — Scoped Client/Subcontractor/Supplier Portal

### النتيجة التشغيلية

بوابة web محدودة بالجهة والعقد للـsubmissions/WIR/invoices/documents/comments دون
كشف بيانات مشروع أو مورد آخر. لا نشر خارجي دون موافقة المستخدم.

### التنفيذ المطلوب

- tenant/party/contract scope في API وqueries؛ server-side auth/RBAC من G2.
- workflows للرفع والتقديم والمتابعة والتعليق؛ الموافقة الداخلية تبقى منفصلة.
- attachment metadata، size/type limits، hash، quarantine/scanning interface، versioning.
- responsive portal، notifications opt-in، session expiry، rate limits، audit.
- التكامل عبر G1 protocol/API ولا يكتب portal مباشرة إلى SQLite desktop.

### بوابة القبول

tenant isolation adversarial tests، guessed IDs، expired session، role boundaries،
upload limits/type/hash، duplicate submission، approval separation، sync reconciliation.

---

# المرحلة H — Decision Intelligence

## H1 — Read-only Decision Assistant

### النتيجة التشغيلية

مساعد محلي/اختياري يفسر snapshot محكومًا ويربط كل رقم بمصدره، ولا يملك أي وسيلة
لتعديل أو اعتماد أو حذف البيانات.

### التنفيذ المطلوب

- read-only query service فوق reconciliation/snapshot APIs فقط، مع permission scope من
  G2 وData Date ظاهر. لا SQL حر ولا generic repository mutation tool.
- كل إجابة رقمية تعيد value/unit/Data Date/source rows/calculation basis/confidence؛
  وعند غياب المصدر تقول لا توجد بيانات كافية.
- حالات استخدام: تفسير variance، forecast risk، cash shortage، schedule criticality،
  draft executive summary. لا approval أو posting أو إرسال خارجي.
- حماية prompt injection: المستندات بيانات غير موثوقة؛ لا تنفذ تعليماتها، ولا تكشف
  secrets أو بيانات خارج scope. offline mode واضح، ولا ادعاء باتصال غير موجود.
- evaluation dataset من المشروع المرجعي: أسئلة بإجابات رقمية معروفة، missing data،
  malicious document، cross-role، citation correctness.

### بوابة القبول

100% منع mutation tools، دقة الأرقام والمصادر، Data Date، permissions، injection،
missing data، offline/error handling، ومقارنة الإجابة مباشرة بالمحرك المركزي.

## صيغة تقرير نتيجة كل ميزة

يجب أن يحتوي `docs/agent-results/<ID>_RESULT.md` على:

1. `START_HEAD` و`END_HEAD` والوكيل/النموذج.
2. جدول كل معيار قبول: `PASS / FAIL / NOT RUN` مع ملف/اختبار الدليل.
3. ملفات `ACCEPT / REPAIR / DEFER / REMOVE-UNSAFE` إن كان هناك عمل سابق.
4. migrations والأوامر الذرية ومسارات UI والإدماج في `useData/repository`.
5. أوامر الاختبار والملخص الرقمي الحقيقي؛ لا عبارة «كل الاختبارات نجحت» دون output.
6. ما لم ينفذ وسبب ذلك، و`Exact next action` على مستوى الملف والدالة.
7. `git diff --name-status START_HEAD..END_HEAD` والتأكيد أن لا D/R غير مصرح.
8. الحالة النهائية الوحيدة المسموحة للوكيل:
   `READY FOR CODEX REVIEW` أو `WIP/BLOCKED`؛ لا `CLOSED` ولا تقييم 8/10 ذاتي.
