# نشر بوابة تخطي AI

## المكونات
الواجهة الثابتة على Render. يوجد Cloudflare Worker في worker/index.js بمسارين GET /health وPOST /api/generate. المزودات المدعومة في الخادم: Gemini وOpenAI. وجود الكود لا يعني أن المفاتيح أو النشر مهيأة.

## نشر Worker
1. افتح Workers & Pages في حساب Cloudflare.
2. من جذر المستودع نفّذ: npm install ثم npx wrangler login ثم npx wrangler deploy --config wrangler.toml
3. أضف الأسرار من الطرفية دون وضعها في GitHub أو HTML: npx wrangler secret put APP_TOKEN وnpx wrangler secret put GEMINI_API_KEY. يمكن إضافة OPENAI_API_KEY اختياريًا.
4. اضبط ALLOWED_ORIGINS في إعدادات Worker على https://takhti-ai-studio.onrender.com. أضف الدومين المخصص فقط إن كان مستخدمًا. لا تستخدم *.
5. أدخل رابط Worker في واجهة البوابة. اختبر /health ثم أرسل طلبًا قصيرًا إلى Gemini، وتحقق من النتيجة وسجلات Worker.

## تنبيه أمني
الواجهة الحالية تطلب APP_TOKEN في المتصفح، وهذا لا يناسب إطلاقًا عامًا متعدد المستخدمين لأن الرمز المشترك قد يُكشف. قبل فتح الخدمة للعامة، استبدل ذلك بمصادقة مستخدمين أو بوابة موثوقة مع تحديد معدل الطلبات وحصص لكل مستخدم. لا تضع مفتاح Gemini أو OpenAI في المتصفح.

## الاختبارات
شغّل npm test وnpm run check:api. اختبارات Worker محاكاة محلية لمسارات النجاح والأخطاء، وليست إثباتًا لعمل مزود API الحقيقي. الاختبار الحقيقي يحتاج أسرارًا صحيحة ونشر Worker.
