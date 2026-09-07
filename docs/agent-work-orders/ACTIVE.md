# أمر العمل النشط

## F1 — Labor Timesheet Approval & Actual-Cost Posting

الحالة: **F1 REPAIRED & VERIFIED — READY FOR CODEX GATE / F2 UNLOCK**.

تم استكمال جميع بنود إصلاح F1 طبقا لتقرير Codex (`docs/agent-results/CODEX_F1_F2_VERIFICATION_2026-09-07.md`):
1. دورة الحوكمة الذرية الكاملة في Rust (`submit_labor_timesheet`, `approve_labor_timesheet`, `post_labor_timesheet`, `reverse_labor_timesheet`) مع منع تخطي المراحل (`Draft -> Submitted -> Approved -> Posted -> Reversed`).
2. تسجيل السجل الرقابي `audit_log` والـ mutation guards لكل عملية حوكمة.
3. الترحيل الفعلي للتكاليف الفعلية إلى `cost_entries` بنوع `Timesheet` ومعكوساتها السالبة عند الاسترجاع مع تعيين `reversed_at` و `reversed_by` و `reversal_reason`.
4. التحقق الشامل من فترات التقرير المغلقة، والتقويم وأيام العطل غير الرسمية، ومنع تكرار العامل في نفس الوردية/التاريخ عبر بطاقات العمل النشطة.
5. حراسة الـ Generic CRUD في `src/App.tsx` وربط واجهة العمل التفاعلية الكاملة `LaborTimesheetModal.tsx` بجميع أوامر الحوكمة.
6. نجاح كافة اختبارات المشروع (`npm run lint` نظيف، `compile_applet` ناجح، و 205/205 اختبارات Node خضراء بالكامل).

الخطوة التالية المجدولة: مراجعة Codex لبوابة F1 ثم البدء في F2 (Equipment Meter, Hours & Fuel Posting).
