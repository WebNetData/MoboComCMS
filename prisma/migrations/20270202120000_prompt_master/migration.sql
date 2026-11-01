-- Prompt Master: additive module-owned templates and private canonical-user generations.
CREATE TABLE "PromptTemplate" (
 "id" SERIAL PRIMARY KEY, "slug" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL, "summary" TEXT NOT NULL DEFAULT '',
 "kind" TEXT NOT NULL DEFAULT 'TEXT', "category" TEXT NOT NULL DEFAULT '', "tags" TEXT NOT NULL DEFAULT '',
 "content" TEXT NOT NULL, "example" TEXT NOT NULL DEFAULT '', "defaults" TEXT NOT NULL DEFAULT '{}', "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "featured" BOOLEAN NOT NULL DEFAULT false, "sortOrder" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 1,
 "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PromptTemplate_kind_check" CHECK ("kind" IN ('TEXT','IMAGE','VIDEO','CODE')),
 CONSTRAINT "PromptTemplate_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED') AND ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL)),
 CONSTRAINT "PromptTemplate_content_check" CHECK (length("title") BETWEEN 3 AND 120 AND length("slug") BETWEEN 1 AND 100 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("content") BETWEEN 20 AND 12000 AND position('{{idea}}' in "content") > 0 AND length("example") <= 4000 AND "version" > 0 AND jsonb_typeof("defaults"::jsonb) = 'object')
);
CREATE INDEX "PromptTemplate_status_kind_category_sortOrder_idx" ON "PromptTemplate"("status","kind","category","sortOrder");
CREATE TABLE "PromptGeneration" (
 "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "title" TEXT NOT NULL, "kind" TEXT NOT NULL, "input" TEXT NOT NULL, "output" TEXT NOT NULL,
 "engine" TEXT NOT NULL DEFAULT 'STRUCTURED', "model" TEXT NOT NULL DEFAULT '', "pinned" BOOLEAN NOT NULL DEFAULT false,
 "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PromptGeneration_kind_check" CHECK ("kind" IN ('TEXT','IMAGE','VIDEO','CODE')),
 CONSTRAINT "PromptGeneration_engine_check" CHECK ("engine" IN ('STRUCTURED','AI','EDITED')),
 CONSTRAINT "PromptGeneration_content_check" CHECK (length("title") BETWEEN 1 AND 160 AND length("output") BETWEEN 10 AND 24000 AND length("input") <= 20000 AND "version" > 0 AND jsonb_typeof("input"::jsonb) = 'object')
);
CREATE INDEX "PromptGeneration_userId_pinned_createdAt_idx" ON "PromptGeneration"("userId","pinned","createdAt");
INSERT INTO "Vocabulary" ("section","list","code","name","nameEn","sortOrder","updatedAt") VALUES ('prompts','CATEGORY','WRITING','نوشتن و یادگیری','Writing & learning',0,now()) ON CONFLICT ("section","list","code") DO NOTHING;
INSERT INTO "Vocabulary" ("section","list","code","name","nameEn","sortOrder","updatedAt") VALUES ('prompts','CATEGORY','MARKETING','بازاریابی و کسب‌وکار','Marketing & business',1,now()) ON CONFLICT ("section","list","code") DO NOTHING;
INSERT INTO "Vocabulary" ("section","list","code","name","nameEn","sortOrder","updatedAt") VALUES ('prompts','CATEGORY','DESIGN','طراحی و هنر','Design & art',2,now()) ON CONFLICT ("section","list","code") DO NOTHING;
INSERT INTO "Vocabulary" ("section","list","code","name","nameEn","sortOrder","updatedAt") VALUES ('prompts','CATEGORY','VIDEO','ویدئو و روایت','Video & storytelling',3,now()) ON CONFLICT ("section","list","code") DO NOTHING;
INSERT INTO "Vocabulary" ("section","list","code","name","nameEn","sortOrder","updatedAt") VALUES ('prompts','CATEGORY','DEVELOPMENT','کدنویسی و محصول','Code & product',4,now()) ON CONFLICT ("section","list","code") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('brand-campaign','کمپین خلاق، با یک پیام روشن','از شناخت مخاطب تا پیام اصلی، کانال انتشار و معیار ارزیابی کمپین.','TEXT','MARKETING','کمپین,برند,تبلیغات','برای این درخواست یک کمپین قابل اجرا طراحی کن:
{{idea}}
مخاطب، بینش، پیام مرکزی، سه مسیر خلاق، کانال‌ها و معیار سنجش را جدا کن. دربارهٔ بودجه و محصولِ داده‌نشده فرض قطعی نساز.','برای معرفی یک برند قهوهٔ تخصصی، کمپینی با بودجهٔ محدود طراحی کن.','{"role":"استراتژیست برند و مدیر خلاقیت","audience":"مشتریان بالقوهٔ برند","tone":"خلاقانه"}','PUBLISHED',true,0,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('learn-something','یک موضوع دشوار، ساده و دقیق','توضیح لایه‌به‌لایه همراه مثال، تمرین و سنجش درک مطلب.','TEXT','WRITING','آموزش,یادگیری,مثال','این موضوع را متناسب با سطح مخاطب آموزش بده:
{{idea}}
از یک مثال ملموس شروع کن، مفهوم را مرحله‌به‌مرحله بساز، خطاهای رایج را نشان بده و سه تمرین با پاسخ کوتاه بده. اصطلاح تازه را تعریف کن.','مفهوم شبکه‌های عصبی را برای کسی که برنامه‌نویسی مقدماتی بلد است توضیح بده.','{"role":"آموزگار دقیق و صبور","tone":"آموزشی","format":"فهرست مرحله‌ای"}','PUBLISHED',true,1,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('editorial-outline','طرح مقاله‌ای که ارزش خواندن دارد','زاویهٔ مشخص، ساختار مقاله، پرسش‌های خواننده و مرز واقعیت‌ها.','TEXT','WRITING','مقاله,سئو,مجله','برای این ایده طرح مقاله تهیه کن:
{{idea}}
قصد جست‌وجو، زاویهٔ متمایز، عنوان‌های پیشنهادی، تیترهای بخش‌ها و پرسش‌های رایج را بنویس. مشخص کن چه اطلاعاتی به منبع یا بررسی روز نیاز دارد. آمار و مشخصات ساختگی نده.','برای مقالهٔ انتخاب لپ‌تاپ دانشجویی یک طرح جامع بنویس.','{"role":"سردبیر یک مجلهٔ تخصصی","tone":"حرفه‌ای"}','PUBLISHED',false,2,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('content-calendar','تقویم محتوای هدفمند','موضوع، قالب، دعوت به اقدام و هدف هر محتوا در یک جدول.','TEXT','MARKETING','شبکه اجتماعی,برنامه‌ریزی,محتوا','تقویم محتوای قابل اجرا برای درخواست زیر بساز:
{{idea}}
برای هر روز، موضوع، هدف، قالب، ایدهٔ بصری و دعوت به اقدام را مشخص کن. پیشنهادها را با منابع و امکانات داده‌شده سازگار نگه دار.','برای یک فروشگاه آنلاین لوازم طراحی، تقویم محتوای دو هفته‌ای بساز.','{"role":"استراتژیست محتوا","format":"جدول"}','PUBLISHED',false,3,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('product-story','توضیح محصول، بدون اغراق','ویژگی‌ها را به منفعت واقعی تبدیل کنید؛ با لحن روشن و قابل اعتماد.','TEXT','MARKETING','فروشگاه,محصول,کپی‌رایتینگ','برای این محصول متن معرفی بنویس:
{{idea}}
مشکل مخاطب، منفعت‌های واقعی، ویژگی‌های داده‌شده، موارد استفاده و دعوت به اقدام را روشن کن. قیمت، ضمانت، ادعای سلامتی یا مشخصات ذکرنشده نساز.','برای یک دفتر برنامه‌ریزی روزانه با جلد بازیافتی، متن معرفی محصول بنویس.','{"role":"نویسندهٔ تجربهٔ خرید","tone":"صمیمی"}','PUBLISHED',false,4,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('product-studio','عکاسی استودیویی محصول','سوژه، جنس سطوح، نور کنترل‌شده و فضای خالی برای معرفی محصول.','IMAGE','DESIGN','عکاسی محصول,استودیو,نورپردازی','یک تصویر تبلیغاتی دقیق برای این سوژه توصیف کن:
{{idea}}
جای سوژه، پس‌زمینه، جهت نور، عمق میدان، بازتاب و بافت‌ها را به‌صورت یک پرامپت منسجم مشخص کن. جزئیات طراحی محصول را از دادهٔ ورودی حفظ کن.','عکس تبلیغاتی یک بطری عطر شیشه‌ای روی سنگ روشن با سایه‌های نرم.','{"style":"عکاسی استودیویی واقعی، نور جانبی نرم، جزئیات جنس شیشه، فضای منفی","ratio":"3:4","negative":"واترمارک، نوشتهٔ ناخواسته، هندسهٔ معیوب و بازتاب ناممکن"}','PUBLISHED',true,5,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('editorial-poster','پوستر با یک ایدهٔ بصری قوی','ترکیب‌بندی، تایپوگرافی پیشنهادی و هویت رنگی یک پوستر متمایز.','IMAGE','DESIGN','پوستر,گرافیک,تبلیغات','برای این پوستر یک پرامپت طراحی دقیق بنویس:
{{idea}}
یک مفهوم مرکزی بصری، سلسله‌مراتب، شبکهٔ ترکیب‌بندی، فضای خالی، رنگ‌ها و جنس چاپ مشخص کن. اگر متن دقیق داده نشده، به‌جای ساختن نوشته، محل تایپوگرافی را خالی بگذار.','پوستری برای جشنوارهٔ فیلم مستقل با محور نور و سایه طراحی کن.','{"style":"طراحی گرافیک تحریریه‌ای، ترکیب‌بندی جسورانه، بافت چاپ ظریف","ratio":"3:4"}','PUBLISHED',true,6,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('natural-portrait','پرترهٔ طبیعی و روایت‌دار','حالت، محیط، نور و کادر برای پرتره‌ای با جزئیات واقعی.','IMAGE','DESIGN','پرتره,عکاسی,روایت','این پرتره را در قالب یک پرامپت بصری یکپارچه توصیف کن:
{{idea}}
حالت بدن و چهره، رابطهٔ سوژه با محیط، جهت نور، قاب، فاصلهٔ دوربین و بافت‌های مهم را مشخص کن. روایت را با یک کنش طبیعی منتقل کن.','پرترهٔ یک سفالگر بزرگسال در کارگاهش هنگام کار با گل.','{"style":"عکاسی مستند، نور طبیعی پنجره، رنگ‌های خاکی، بافت پوست طبیعی","ratio":"3:4","negative":"پوست پلاستیکی، انگشت اضافه، نوشته و واترمارک"}','PUBLISHED',false,7,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('visual-interface','کانسپت رابط کاربری','کانسپت بصری یک محصول دیجیتال با سلسله‌مراتب و جزئیات تعامل.','IMAGE','DESIGN','رابط کاربری,محصول,طراحی','برای این رابط کاربری پرامپت کانسپت بصری بنویس:
{{idea}}
کار اصلی صفحه، بخش‌های اطلاعات، سلسله‌مراتب، وضعیت انتخاب‌شده، کنترل‌های اصلی و رفتار واکنش‌گرا را مشخص کن. از شلوغی تزئینی پرهیز کن.','یک داشبورد مدیریت پروژه برای تیم‌های خلاق با حالت تیره طراحی کن.','{"style":"رابط محصول دقیق، تایپوگرافی خوانا، سلسله‌مراتب روشن، رنگ تأکیدی محدود","ratio":"16:9"}','PUBLISHED',false,8,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('cinematic-scene','یک صحنهٔ سینمایی کوتاه','کنش، حرکت دوربین، نور و صدای یک پلان منسجم.','VIDEO','VIDEO','سینما,پلان,حرکت دوربین','برای این صحنه یک پرامپت ویدئویی بنویس:
{{idea}}
شروع، کنش اصلی و پایان پلان را با زمان‌بندی تقریبی روشن کن. سوژه، جهت حرکت، لنز پیشنهادی، حرکت دوربین، نور و صدای محیط سازگار باشند. از برش یا تغییر هویت ناخواسته جلوگیری کن.','یک قطار قدیمی در سپیده‌دم وارد ایستگاهی مه‌آلود می‌شود.','{"style":"حرکت تراولینگ آرام، نور سرد سحر، هایلایت گرم چراغ قطار","duration":"10","ratio":"16:9"}','PUBLISHED',true,9,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('short-ad','روایت کوتاه تبلیغاتی','قلاب آغاز، نمایش منفعت و پایان روشن برای ویدئوی کوتاه.','VIDEO','VIDEO','تبلیغات,ویدئوی کوتاه,استوری','برای این ویدئو پرامپت یک روایت کوتاه آماده کن:
{{idea}}
قلاب شروع، لحظهٔ نمایش منفعت واقعی و پایان را جدا کن. تداوم سوژه و نور، زمان هر بخش و صدا را مشخص کن. ادعا یا ویژگی ذکرنشده به محصول اضافه نکن.','ویدئوی کوتاهی برای معرفی یک ماگ سفری با تمرکز بر شروع روز.','{"style":"روایت گرم روزمره، کلوزآپ جزئیات، حرکت دوربین کنترل‌شده","duration":"15","ratio":"9:16"}','PUBLISHED',false,10,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('storyboard','استوری‌بورد قابل اجرا','طرح پلان‌ها، زمان‌بندی و پیوستگی برای یک داستان بصری.','VIDEO','VIDEO','استوری‌بورد,روایت,سناریو','این ایده را به یک پرامپت استوری‌بورد تبدیل کن:
{{idea}}
برای هر پلان زمان، کادر، کنش، حرکت دوربین، نور، صدا و انتقال به پلان بعد را بنویس. توصیف ثابت شخصیت و مکان را در ابتدا مشخص کن.','داستان کوتاهی از رسیدن یک نامهٔ قدیمی به صاحبش روایت کن.','{"style":"روایت بصری مینیمال با جزئیات محیط و انتقال نرم میان پلان‌ها","duration":"30","ratio":"16:9"}','PUBLISHED',false,11,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('frontend-feature','پیاده‌سازی یک قابلیت محصول','نیاز واقعی، حالت‌های رابط، دسترس‌پذیری و معیار پذیرش.','CODE','DEVELOPMENT','فرانت‌اند,React,توسعه محصول','این قابلیت را در پروژهٔ موجود پیاده‌سازی کن:
{{idea}}
ابتدا صاحب قابلیت، اجزای قابل استفاده و قرارداد داده را بررسی کن. حالت‌های بارگذاری، خالی، خطا، انتخاب، صفحه‌کلید و موبایل را پوشش بده. تغییرات را محدود نگه دار و بررسی‌های واقعاً اجراشده را گزارش کن.','یک فیلتر جست‌وجوی واکنش‌گرا برای فهرست محصولات موجود بساز.','{"role":"مهندس ارشد محصول و فرانت‌اند","context":"ابتدا ساختار و اجزای موجود پروژه را بررسی کن و آن‌ها را گسترش بده.","format":"کد همراه توضیح"}','PUBLISHED',true,12,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('debug-safely','عیب‌یابی با شواهد','از بازتولید خطا تا اصلاح محدود و آزمون جلوگیری از بازگشت.','CODE','DEVELOPMENT','دیباگ,تست,بازبینی کد','این مشکل را بررسی و اصلاح کن:
{{idea}}
ابتدا آن را بازتولید کن، فرضیه‌ها را با شواهد رتبه‌بندی کن و علت اصلی را پیدا کن. کوچک‌ترین اصلاح سازگار را اعمال کن و با آزمون مرتبط ثابت کن. اگر بررسی اجرا نشد، صریح بگو؛ داده یا دسترسی را برای عبور از خطا تضعیف نکن.','علت نمایش دادهٔ قدیمی بعد از تغییر فیلتر در یک صفحهٔ React را پیدا کن.','{"role":"مهندس ارشد عیب‌یابی","context":"لاگ، نمونهٔ ورودی، نتیجهٔ مورد انتظار و نتیجهٔ واقعی را از کد موجود بررسی کن."}','PUBLISHED',false,13,now()) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "PromptTemplate" ("slug","title","summary","kind","category","tags","content","example","defaults","status","featured","sortOrder","publishedAt") VALUES ('api-contract','API با قرارداد روشن','ورودی/خروجی، مجوز، خطا، تکرارپذیری و سازگاری نسخه‌ها.','CODE','DEVELOPMENT','API,بک‌اند,معماری','برای این نیاز قرارداد API قابل پیاده‌سازی ارائه کن:
{{idea}}
مالک قابلیت و سرویس‌های مشترک موجود را مشخص کن. مسیرها، نمونهٔ ورودی/خروجی، احراز هویت، مالکیت منابع، محدودیت درخواست، خطا و رفتار هم‌زمانی را بنویس. اگر مسیر فعلی وجود دارد، آن را با حفظ سازگاری گسترش بده.','برای ثبت و پیگیری درخواست پشتیبانی در یک سامانهٔ موجود، API طراحی کن.','{"role":"مهندس ارشد بک‌اند و قراردادهای API","format":"Markdown"}','PUBLISHED',false,14,now()) ON CONFLICT ("slug") DO NOTHING;
-- Add the requested section once; retain all saved menu entries/order/overrides. Invalid legacy JSON is left for its owner.
DO $$ DECLARE saved jsonb; BEGIN
 SELECT "value"::jsonb INTO saved FROM "Setting" WHERE "key"='site.config.v1';
 IF saved IS NOT NULL AND jsonb_typeof(saved->'navigation')='array' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(saved->'navigation') e WHERE e->>'href' LIKE '/prompts%') THEN
  UPDATE "Setting" SET "value"=jsonb_set(saved,'{navigation}',(saved->'navigation') || '[{"label":{"fa":"پرامپت مستر","en":"Prompt Master"},"href":"/prompts","icon":"sparkles"}]'::jsonb)::text WHERE "key"='site.config.v1';
 END IF;
EXCEPTION WHEN invalid_text_representation THEN RAISE WARNING 'Existing site configuration left unchanged: invalid JSON'; END $$;
