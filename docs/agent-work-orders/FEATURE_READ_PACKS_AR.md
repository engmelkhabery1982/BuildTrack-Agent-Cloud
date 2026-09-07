# BuildTrack — حزم القراءة الدنيا لكل ميزة

الإصدار: 2026-09-07  
الغرض: منع الوكيل من قراءة ملفات المشروع كاملة أو استهلاك التوكنز في ملفات لا تخدم
الميزة الحالية. هذه الوثيقة **تقيد القراءة** ولا تقلل معايير القبول أو الحوكمة.

## بروتوكول القراءة الإلزامي

1. اقرأ فقط: `AGENTS.md`، قسم الحالة الحالية من
   `docs/agent-work-orders/CLOUD_PROGRESS_LEDGER.md`، وقسم الميزة الحالية من
   `docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md`، ثم حزمة الميزة
   أدناه. لا تقرأ بقية خارطة الطريق أو تقارير الميزات المغلقة.
2. ابدأ بـ`rg -n "symbol|table|command" <listed-files>` ثم افتح المقطع المطابق فقط
   مع سياق لا يزيد عادة عن 120 سطرًا. يحظر فتح `src/App.tsx` أو
   `src-tauri/src/lib.rs` أو `src/types/index.ts` كاملًا.
3. الحد الأولي: 12 ملفًا و40,000 حرف مقروء. لا تتجاوزه قبل تسجيل سبب محدد في
   `<FEATURE>_RESULT.md`: الرمز المطلوب، الملف المتوقع، ولماذا الملفات المدرجة غير كافية.
4. `package-lock.json` و`Cargo.lock` و`bun.lock` و`dist/` و`node_modules/` و
   `src-tauri/target/` وملفات الصور/الأرشيف/قواعد البيانات ليست مصادر قراءة.
5. الملفات المشتركة الكبيرة تقرأ بالمقاطع التالية فقط:
   - `src/App.tsx`: imports، NAV، أعمدة/VIEW_CONFIG للكيان، ثم كتلة
     `DataTableView` الخاصة بـonInsert/onUpdate/rowAction فقط.
   - `src-tauri/src/lib.rs`: آخر migrations، wrappers للأوامر، و`invoke_handler` فقط.
   - `src/types/index.ts`: interfaces الخاصة بالميزة والكيانات المرتبطة فقط.
   - `src/data/sqliteRepository.ts`: `KNOWN_TABLES` وmapping/guard للكيانات الحالية فقط.
   - `src/hooks/useData.ts`: state/load/return للكيانات الحالية فقط.
6. لا توسع القراءة لأن اسم ملف يبدو متعلقًا. استخدمه فقط إذا ثبت dependency مباشر
   من import/call/schema/foreign key. سجل كل توسع في تقرير النتيجة.

## F1 — Labor Timesheet Approval & Actual-Cost Posting

### MUST READ

- `docs/agent-results/CODEX_F1_F2_VERIFICATION_2026-09-07.md` — قسم F1 فقط
- `src-tauri/src/labor_timesheet.rs`
- `src/data/laborTimesheet.ts`
- `tests/labor-timesheet.test.mjs`
- `src/utils/resourceLoading.ts` — calendar/capacity symbols فقط
- `src/utils/controlAccountSummary.ts` — AC source rules فقط
- `src/types/index.ts` — `LaborTimesheet*`, `ResourceMaster`, `Schedule`, `ControlAccount`, `CostEntry`
- `src/data/dataDictionary.ts` — labor/cost fields فقط
- `src/data/sqliteRepository.ts` — labor tables + governed-status guards فقط
- `src/hooks/useData.ts` — labor state/load/return فقط
- `src/App.tsx` — labor imports/NAV/columns/config/form/actions فقط
- `src-tauri/src/lib.rs` — migrations 61 وما بعدها + labor wrappers/registration فقط
- `tests/financial-ledger-migration.test.mjs`
- `tests/tauri-command-registration.test.mjs`

### READ ONLY IF DIRECTLY REQUIRED

- `src/utils/schedulePlanning.ts` عند إعادة استخدام calendar engine.
- `tests/control-account-migration.test.mjs` عند تعديل AC attribution.
- `src/components/DataTableView.tsx` فقط لفهم props قائمة فعلًا؛ لا تعِد تصميم الجدول.

### DO NOT READ/TOUCH

Dashboard وReport Pack وPrimavera وClaims/Invoices/Portal. انعكاس F1 يتم تلقائيًا
من `cost_entries`; افتح مستهلكًا فقط إذا أثبت اختبار reconciliation عدم وصول القيد.

## F2 — Equipment Meter, Hours & Fuel Posting

### MUST READ

- `docs/agent-results/CODEX_F1_F2_VERIFICATION_2026-09-07.md` — قسم F2 فقط
- `src-tauri/src/equipment_log.rs`
- `src/data/equipmentLog.ts`
- `tests/equipment-log.test.mjs`
- `src/utils/resourceLoading.ts` — equipment capacity/calendar فقط
- `src/utils/controlAccountSummary.ts` — AC source rules فقط
- `src/types/index.ts` — `EquipmentLog`, `Equipment`, `ResourceMaster`, `Schedule`, `ControlAccount`, `CostEntry`
- `src/data/dataDictionary.ts` — equipment/cost fields فقط
- `src/data/sqliteRepository.ts` — equipment log mapping/guards فقط
- `src/hooks/useData.ts` — equipment-log state/load/return فقط
- `src/App.tsx` — equipment-log imports/NAV/columns/config/form/actions فقط
- `src-tauri/src/lib.rs` — migrations 62 وما بعدها + equipment wrappers/registration فقط
- `tests/financial-ledger-migration.test.mjs`
- `tests/tauri-command-registration.test.mjs`

### READ ONLY IF DIRECTLY REQUIRED

- `src/utils/schedulePlanning.ts` لحساب shift/calendar capacity.
- `tests/control-account-migration.test.mjs` عند تعديل AC attribution.
- `src/components/DataTableView.tsx` لمواضع props/actions فقط.

### DO NOT READ/TOUCH

ملفات Labor إلا لاختبار عدم الخلط، وDashboard/Report Pack/Primavera/Claims/Invoices.

## F3 — Claims / Potential Variation Order

### MUST READ

- `src/data/variationPackage.ts`
- `src/data/commercialWorkflow.ts`
- `src/utils/delayImpact.ts`
- `src/components/DelayRegisterModal.tsx`
- `src/types/index.ts` — Claim/Variation/Delay/RFI/Document/Contract فقط
- `src/data/dataDictionary.ts` — claim/variation fields فقط
- `src/data/sqliteRepository.ts` — claim/variation mapping/guards فقط
- `src/hooks/useData.ts` — claim/variation slices فقط
- `src/App.tsx` — claim/variation nav/config/actions فقط
- `src-tauri/src/lib.rs` — latest claim/variation migration/commands فقط
- `tests/delay-impact-register.test.mjs`
- `tests/phase1-commercial.test.mjs` — variation tests فقط

### CONDITIONAL

- `src/utils/cpm.ts` لنتيجة time claim فقط.
- `src/components/DataTableView.tsx` للـprops الموجودة فقط.

## F4 — Invoice & Certificate Reconciliation

### MUST READ

- `src/data/commercialWorkflow.ts`
- `src/data/supplierAp.ts`
- `src/utils/commercialControl.ts`
- `src/utils/paymentTerms.ts`
- `src/utils/quantityLedger.ts`
- `src/types/index.ts` — WIR/BOQ/Invoice/Certificate/Payment فقط
- `src/data/dataDictionary.ts` — invoice/certificate fields فقط
- `src/data/sqliteRepository.ts` — invoice/certificate/payment mappings/guards فقط
- `src/hooks/useData.ts` — هذه slices فقط
- `src/App.tsx` — invoice/certificate forms/actions فقط
- `src-tauri/src/lib.rs` — commercial/AP migrations/wrappers/registration فقط
- `src-tauri/src/commercial_workflow.rs`
- `src-tauri/src/supplier_ap.rs`
- `tests/phase1-commercial.test.mjs`
- `tests/contract-schedule-wir-acceptance-20260825.test.mjs` — WIR/quantity tests فقط

## F5 — Versioned Cash Forecast Assumptions

### MUST READ

- `src/utils/cashForecast.ts`
- `src/utils/cashFlowForecast.ts`
- `src/components/CashFlowForecastBoard.tsx`
- `src/utils/paymentTerms.ts`
- `src/types/index.ts` — Cash/Payment/Certificate/PO/AP فقط
- `src/data/dataDictionary.ts` — cash forecast fields فقط
- `src/data/sqliteRepository.ts` — cash forecast mappings/guards فقط
- `src/hooks/useData.ts` — cash slices فقط
- `src/App.tsx` — cash view wiring فقط
- `src-tauri/src/lib.rs` — cash/version migration and commands only
- `tests/phase1-commercial.test.mjs` — cash tests فقط
- `tests/project-forecast.test.mjs` — cash horizon tests فقط

## F6 — Governed Project Health Score

### MUST READ

- `src/utils/earlyWarningSystem.ts`
- `src/utils/projectControlAnalytics.ts`
- `src/components/IntegratedProjectControlsCockpit.tsx`
- `src/components/Dashboard.tsx` — health card consumer فقط
- `src/components/ReportPack.tsx` — health consumer فقط
- `src/components/PreferencesPanel.tsx` — thresholds فقط
- `src/types/index.ts` — health/config/result only
- `src/data/dataDictionary.ts` — health config only
- `src/data/sqliteRepository.ts` — health config only
- `src/hooks/useData.ts` — health config only
- `src-tauri/src/lib.rs` — health version migration/commands only
- `tests/early-warning-system.test.mjs`
- `tests/agent-cloud-integration-gates.test.mjs` — E1 wiring gate فقط

## F7 — Resource Leveling Decision Register

### MUST READ

- `src/utils/resourceLoading.ts`
- `src/utils/cpm.ts`
- `src/utils/scheduleVersioning.ts`
- `src/utils/schedulePlanning.ts`
- `src/components/ResourceCapacityBoard.tsx`
- `src/components/ScheduleVersionModal.tsx`
- `src/types/index.ts` — Resource/Schedule/Calendar/Version only
- `src/data/dataDictionary.ts` — leveling/version fields only
- `src/data/sqliteRepository.ts` — related mappings/guards only
- `src/hooks/useData.ts` — related slices only
- `src/App.tsx` — resource/schedule wiring only
- `src-tauri/src/lib.rs` — related migration/commands only
- `tests/recovered-project-controls.test.mjs` — resource tests only
- `tests/schedule-versioning.test.mjs`

## F8 — Persistent Report Designer

### MUST READ

- `src/components/ReportTemplateDesigner.tsx`
- `src/components/ReportPack.tsx`
- `src/data/reportVersioning.ts`
- `src-tauri/src/report_versioning.rs`
- `src/types/index.ts` — ReportTemplate/ReportVersion/Attachment only
- `src/data/dataDictionary.ts` — report fields only
- `src/data/sqliteRepository.ts` — report mappings/guards only
- `src/hooks/useData.ts` — report slices only
- `src/App.tsx` — report wiring only
- `src-tauri/src/lib.rs` — report migration/wrappers/registration only
- `tests/agent-cloud-integration-gates.test.mjs` — E3 report issuance tests only
- `tests/tauri-command-registration.test.mjs` — report command registration only

## F9 — Append-only Audit Explorer

### MUST READ

- `src/components/AuditTrailExplorer.tsx`
- `src/data/sqliteRepository.ts` — audit mapping and mutation restrictions only
- `src/hooks/useData.ts` — audit slice only
- `src/App.tsx` — audit wiring only
- `src/types/index.ts` — audit interfaces only
- `src/data/dataDictionary.ts` — audit fields only
- `src-tauri/src/lib.rs` — audit schema/triggers + governed command registration only
- `src-tauri/src/commercial_workflow.rs`
- `src-tauri/src/supplier_ap.rs`
- `src-tauri/src/cost_plan_versioning.rs`
- `src-tauri/src/report_versioning.rs`
- `tests/phase0-governance.test.mjs` — audit tests only
- `tests/tauri-command-registration.test.mjs`

## G1 — Desktop/Web Hybrid Sync Protocol

### MUST READ

- `src/data/repository.ts`
- `src/data/sqliteRepository.ts`
- `src/data/supabaseRepository.ts`
- `src/hooks/useData.ts`
- `src/types/index.ts` — sync/version/audit types only
- `src/data/dataDictionary.ts` — sync fields only
- `src-tauri/src/lib.rs` — database/bootstrap/migrations only
- `src/App.tsx` — sync status UI only
- `tests/phase0-governance.test.mjs` — persistence/audit tests only

لا تقرأ شاشات الأعمال؛ اختبر protocol بعينات fixtures منفصلة بلا بيانات مستخدم.

## G2 — Users, Roles & Segregation of Duties

### MUST READ

- `src/App.tsx` — login/current user/user form/command actions only
- `src/components/WorkQueue.tsx`
- `src/data/governanceRules.ts`
- `src/data/sqliteRepository.ts` — app_users and protected transitions only
- `src/hooks/useData.ts` — users/approvals only
- `src/types/index.ts` — User/Role/Approval/Audit only
- `src/data/dataDictionary.ts` — security fields only
- `src-tauri/src/lib.rs` — auth/RBAC migration/commands only
- `tests/phase0-governance.test.mjs` — users/approval tests only
- `tests/tauri-command-registration.test.mjs`

## G3 — Scoped External Portal

### MUST READ

- `src/data/repository.ts`
- `src/data/supabaseRepository.ts`
- `src/data/contractScope.ts`
- `src/data/governanceRules.ts`
- `src/types/index.ts` — Party/User/Portal/Document/RFI/Invoice only
- `src/data/dataDictionary.ts` — portal sharing fields only
- `src-tauri/src/lib.rs` — portal/outbox migration only
- `tests/phase0-governance.test.mjs` — scope/security tests only

لا تقرأ Dashboard/Schedule engines؛ البوابة لا تحسب KPI ولا تمنح وصولًا عامًا.

## H1 — Read-only Decision Assistant

### MUST READ

- `src/components/PmoInsights.tsx`
- `src/components/IntegratedProjectControlsCockpit.tsx`
- `src/utils/kpiReconciliation.ts`
- `src/utils/projectControlAnalytics.ts`
- `src/utils/earlyWarningSystem.ts`
- `src/utils/controlAccountSummary.ts`
- `src/data/dataQuality.ts`
- `src/types/index.ts` — assistant/citation/result types only
- `src/data/repository.ts` — read-only interface only
- `src/App.tsx` — assistant route/mount only
- `tests/kpi-source-drilldown-reconciliation.test.mjs`
- `tests/reference-project-acceptance.test.mjs`

لا تقرأ أو تعدّل mutation commands أو migrations إلا إذا احتاج حفظ conversation
محليًا، ولا يسمح للوكيل المساعد باستدعاء insert/update/delete/approve/post/reverse.

## قاعدة الإخراج

يضيف تقرير كل ميزة جدولًا: `Listed file | Symbol/section read | Why | Modified?`.
أي ملف غير مدرج يظهر في diff دون سبب مسجل يفشل بوابة التسليم. القراءة المشروطة لا
تعطي إذن تعديل؛ الملفات المسموح تعديلها هي فقط التي تستلزمها المواصفة والـdependency
المثبتة، مع `DELETE_ALLOWLIST: []`.
