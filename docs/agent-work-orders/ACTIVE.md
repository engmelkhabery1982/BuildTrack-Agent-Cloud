# أمر العمل النشط

## F1 — Labor Timesheet Approval & Actual-Cost Posting

الحالة: **F1 REPAIR REQUIRED — F2 STAGED/UNAPPROVED**.

وصلت مسودتا F1 وF2 في commitي `6b70fb0` و`fce8482`. تم الاحتفاظ بالبنية المفيدة،
لكن لا يجوز بدء F3: F1 أولًا يحتاج إكمال دورة Submitted وربط أزرار العمل بالواجهة
وحراسة generic CRUD وaudit/reversal/ledger reconciliation. بعد نجاح بوابة F1 فقط
يستكمل F2 بنفس الضوابط. تفاصيل التحقق:

- `docs/agent-results/CODEX_F1_F2_VERIFICATION_2026-09-07.md`

تم إغلاق ومراجعة السلسلة السابقة `C4 → D1 → D2 → D3 → D4 → E1 → E2 → E3`
محليًا بعد إصلاحات Codex واختبارات القبول. المرجع المثبت:

- `docs/agent-results/CODEX_D1_E3_INTEGRATION_RESULT.md`
- `docs/agent-work-orders/CLOUD_PROGRESS_LEDGER.md`

لا يبدأ أي وكيل من الذاكرة أو من تقريره السابق. يجب تطبيق القراءة الدنيا فقط:

- قسم F1 فقط من `docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md`.
- حزمة F1 فقط من `docs/agent-work-orders/FEATURE_READ_PACKS_AR.md`.
- تقرير التحقق المشار إليه أعلاه.

الحالة `NEXT` لا تعني السماح بتجاوز بوابة مراجعة Codex أو تعديل المصدر الرسمي
مباشرة. كل تسليم سحابي يظل مسودة حتى المراجعة والاختبار والدمج المحلي.
