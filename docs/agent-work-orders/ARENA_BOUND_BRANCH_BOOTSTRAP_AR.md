# Arena — إدخال نظام V3 في الفرع المقيد دون فقد العمل

1. لا تبدل فرع `arena/*` ولا تستخدم reset/clean/stash/force push.
2. اعرض `git status --short` و`git diff --name-status`.
3. إذا لم توجد أسرار/artifacts أو حذف/rename، احفظ العمل الحالي في commit بعنوان
   `wip(Wxx): preserve Arena work before V3 adoption`؛ هذا checkpoint لا يعني قبولًا.
4. اجلب `origin/main` ثم ادمجه داخل فرع Arena الحالي. عند التعارض لا تخمن:
   - ملفات `docs/agent-work-orders/**`, `tools/agent-*.mjs` و
     `tests/agent-work-order-contract.test.mjs` تأتي من `origin/main`.
   - ملفات مصدر واختبارات Wxx الحالية تبقى من Arena، فالـcheckpoint حفظها.
5. أكمل merge commit، ثم شغّل `node tools/agent-preflight.mjs`.
6. بعد كل ميزة أنشئ commit نهائيًا يحتوي `[handoff] Wxx` وادفع إلى فرع Arena الحالي.
   GitHub يختبره ثم يدمجه في Agent Cloud main فقط. بعد نجاح Action اجلب main قبل التالية.

إذا فشل Action، لا تحاول تجاوز الاختبار ولا تبدأ merge يدويًا إلى main؛ أصلح الميزة في
فرع Arena وادفع commit `[handoff]` جديدًا.
