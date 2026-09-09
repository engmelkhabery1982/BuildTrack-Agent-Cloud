# تشغيل Arena المتوازي أثناء غياب Codex

الهدف استغلال فترة توقف Codex دون دمج غير محكوم. افتح ثلاث محادثات Arena منفصلة؛ لا ترسل
أكثر من ميزة للمحادثة نفسها، ولا تدفع أي نتيجة إلى `main`.

## وكيل W04

اسحب `BuildTrack-Agent-Cloud/main`، شغّل preflight، اقرأ `ACTIVE.md` وملفي مراجعة/إغلاق
W04 وحزمة `RP-W04`، ثم أكمل W04 في فرع Arena الخاص بالجلسة. لا تبدأ W05.

## وكيل W05

اسحب `BuildTrack-Agent-Cloud/main` واقرأ `ACTIVE.md` ثم
`W05_VERSIONED_CASH_FORECAST_CLOSURE_PLAN_AR.md` وقسم F5 من `FEATURE_READ_PACKS_AR.md`.
نفذ مرشح W05 فقط في فرع Arena مستقل، اختبره، وادفع نفس فرع الجلسة. لا تعدل W04/W06 ولا main.

## وكيل W06

اسحب `BuildTrack-Agent-Cloud/main` واقرأ `ACTIVE.md` ثم
`W06_GOVERNED_PROJECT_HEALTH_CLOSURE_PLAN_AR.md` وقسم F6 من `FEATURE_READ_PACKS_AR.md`.
نفذ مرشح W06 فقط في فرع Arena مستقل، اختبره، وادفع نفس فرع الجلسة. لا تعدل W04/W05 ولا main.

كل وكيل يرسل: branch، commit SHA، `git status --short`، نتائج Node/build/Cargo المتاحة،
والفجوات الصريحة. `READY FOR CODEX REVIEW` ليست قبولًا ولا تصريح دمج.
