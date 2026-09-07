# أمر العمل النشط

## F2 — Equipment Meter, Hours & Fuel Posting

الحالة: **F2 COMPLETED, TESTED & VERIFIED — READY FOR F3**.

تم استكمال وتكامل ميزة F2 (Equipment Meter, Hours & Fuel Posting):
1. دالة حساب إجماليات الساعات والمعدات والوقود (`calculateEquipmentLogTotals`).
2. قواعد التحقق وقواعد العمل لبطاقات المعدات وساعات التشغيل والمواقد والوقود ومنع التداخل ومنع التراجع في العدادات (`validateEquipmentLog`).
3. وحدة الحوكمة في الباكند (`src-tauri/src/equipment_log.rs`) لدعم العمليات الذرية (`approve`, `post`, `reverse`) وتسجيل الحركة والـ audit trails.
4. جدول SQLite Migration 62 لإنشاء `equipment_logs` ومشغّل منع التعديل بعد الاعتماد أو الترحيل.
5. مكون واجهة المستخدم المتفاعل `src/components/EquipmentLogModal.tsx` وربطه بالكامل في `src/App.tsx` وتوفير أزرار فتح السجل وتعديله والاعتماد والترحيل والاسترجاع.
6. نجاح 10/10 اختبارات خاصة بـ F2 بنجاح تام، واجتياز الفحص البرمجي والبناء الإنتاجي.

الخطوة التالية المجدولة: الانتقال إلى **F3 (Subcontractor Progress Measurement & Quantity-based Interims)**.
