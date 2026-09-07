# أمر العمل النشط

## W01 / D1-01 — بوابة قبول دورة العمالة (Labor Timesheet)
الحالة: **ACCEPTED — 10/10**
- تم إغلاق جميع الفجوات (W01-G01 إلى W01-G10).
- دورة الحياة: Draft → Submitted → Approved → Posted → Reversed منفذة ومحمية برمجياً وقاعدياً.
- القيود والترحيل المالي إلى Cost Entries والتسوية العكسية بالاختبارات المؤتمتة (Node & Rust).

## W02 / D1-02 — بوابة قبول دورة المعدات والوقود (Equipment & Fuel Log)
الحالة: **ACCEPTED — 10/10**
- تم إغلاق جميع الفجوات (W02-G01 إلى W02-G10).
- دورة الحياة: Draft → Submitted → Approved → Posted → Reversed مكتملة مع `submit_equipment_log`، `approve_equipment_log`، `post_equipment_log`، و`reverse_equipment_log`.
- ترحيل القيود المالية للمعدات (`EquipmentUsage`) والوقود (`EquipmentFuel`) مع التراجع التلقائي (`Reversal`).
- التحقق الشامل من تراجع العدادات، تداخل العدادات لنفس المعدة، فترات التقارير المغلقة، وتطابق نطاق المشروع والعقد.
- اجتياز جميع اختبارات Node (229/229) واختبارات Rust مع البناء الكامل للإنتاج.

## التالي في خطة الـ90 ميزة:
- W03 (D1-03) طبقاً لملف `NEXT_WEEK_90_FEATURES_EXECUTION_PLAN_AR.md`.


