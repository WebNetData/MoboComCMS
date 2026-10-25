# MoboCom — Whole-Site Engineering & Architecture Quality Standard

> سند اجرایی مشترک Codex و Claude Code؛ مکمل دستورالعمل‌های فعلی مخزن است، نه جایگزین آن‌ها.
> این سند الزامات کیفیت *کل سایت* را تعریف می‌کند، نه صرفاً یک ماژول یا تغییر ظاهری.

## تطبیق با مخزن فعلی — ۲۰۲۶-۱۰-۲۵

این بسته به درخواست مالک به قواعد توسعه افزوده شده است. نصب معماری، اجرای خودکار promptهای داخل بسته یا ممیزی و بازنویسی محصول را شروع نمی‌کند. محدوده و مجوز هر کار از درخواست جاری می‌آید؛ پس از ممیزی کوتاه، اصلاحاتِ از قبل مجاز را بدون درخواست تأیید تکراری ادامه بده. ممیزی سراسری و خروجی جامع فاز A فقط برای درخواست سراسری است؛ در کار عادی بخش مرتبط را بخوان.

ماتریس و صف کار همان `DOMAIN_CAPABILITY_MATRIX.md`، `CAPABILITY_LEDGER.md`، `REMAINING_GAPS.md` و `IMPLEMENTATION_ROADMAP.md` هستند. inventory/blueprint مرتبط را در spec یا handoff همان کار ثبت کن؛ رجیستری وضعیت یا معماری موازی نساز. `Present/Partial/Missing/Unverified` مشاهدهٔ محدود یک معیار است، نه رتبهٔ بلوغ جدید: وجود کد به معنی Functional یا ProductionVerified نیست؛ مورد بررسی‌نشده U باقی می‌ماند. یافته‌ها همان برچسب‌های mobocom-audit را حفظ می‌کنند.

مسیرها و دستورهای نمونه را در checkout فعال تأیید کن. `AGENTS.md` و تصمیم‌های مالک، مرزهای اعتماد و طراحی محافظت‌شده پابرجا هستند. تنظیمات قابل پیکربندی از Admin Control Plane موجود، طبقه‌بندی از taxonomy/vocabulary و افزونه/قالب از registry فعلی توسعه می‌یابد؛ مدیریت از پنل به معنی اجرای دلخواه کد سرور یا تغییر آزاد وضعیت مالی نیست. دسترسی ابزار یا Graphify اثبات رفتار runtime نیست.

برای سهمیهٔ Actions از شواهد محلی استفاده کن؛ workflow میزبانی‌شده را خودکار dispatch یا تکرار نکن. PR و deploy مطابق درخواست مالک انجام می‌شوند. برای تغییر صرفاً سند/اسکیل، مسیر ارجاع‌ها، دو نسخهٔ مهارت‌ها و اعتبار metadata را بررسی کن و اجرای نشدن DB/browser/build را صریح بنویس؛ چنین تغییری بلوغ محصول را ارتقا نمی‌دهد.

## 0. تقدم منابع حقیقت و محدوده اختیار

در هر تسک، ابتدا این منابع را به ترتیب بررسی کن:

1. `AGENTS.md`، `CLAUDE.md` متناسب با Agent و هر دستورالعمل نزدیک به فایل‌های در حال ویرایش.
2. `docs/agent/PLATFORM_DECISIONS.md` و `docs/agent/ARCHITECTURE.md` — تصمیم‌های مالک و معماری رسمی.
3. `docs/agent/MASTER_PROMPT.md` برای مسیر ورود؛ قراردادهای مرتبط در `docs/agent/contracts/`؛ handoff مختص حوزه؛ `docs/agent/DOMAIN_CAPABILITY_MATRIX.md` و `docs/agent/IMPLEMENTATION_ROADMAP.md` برای وضعیت شواهد و ترتیب کار.
4. خود کد و رفتار قابل‌اثبات در checkout/branch فعال، تست‌ها، اسکیماها، مهاجرت‌ها و `package.json` برای واقعیت پیاده‌سازی.
5. این سند برای معیارهای کیفی و طراحی اجرایی، **فقط در مواردی که با منابع بالاتر تعارض ندارد**.

اگر سندی هدف آینده را شرح داده ولی کد موجود چیز دیگری نشان می‌دهد، تفاوت را ثبت کن؛ قابلیت را «پیاده‌سازی‌شده» فرض نکن. تصمیم جدید معماری ناسازگار با تصمیم مالک را خودسرانه اعمال نکن.

## 1. هدف و کیفیت محصول سراسری

موبوکام باید یک پلتفرم یکپارچه، مرتب، فارسی و RTL، قابل مدیریت، ماژولار و قابل رشد باقی بماند. کیفیت با چند فرم خوش‌ظاهر ثابت نمی‌شود. معیارهای اجباری:

- نظم معماری: ownership روشن، مرز وابستگی، قراردادهای versioned و نبود پیاده‌سازی تکراری.
- نظم اطلاعات: نام‌گذاری ثابت، انواع داده و روابط معتبر، دسته‌بندی و گردش‌کار درست.
- نظم تجربه کاربری: معماری اطلاعات، navigation، سلسله‌مراتب، چیدمان فرم و جدول، وضعیت‌های loading/empty/error/success، keyboard، موبایل و accessibility.
- نظم عملیاتی: امنیت، مشاهده‌پذیری، تست، release، rollback و نگهداری.
- توسعه‌پذیری: اضافه شدن قابلیت بدون تغییر ناخواسته دامنه‌های نامرتبط، حفظ داده و قراردادهای عمومی.

**محدودیت جدی:** صفحات عمومی تأییدشده (Homepage، Magazine، Music، Cinema، Games، Software، Store، Community)، URL، SEO، تجربه‌های فعلی، permissions و هویت تصویری را حفظ کن. «استانداردسازی» مجوز بازطراحی عمومی نیست. UI جدید را با SDS/tokens موجود و قواعد `docs/agent/FRONTEND_QUALITY.md` بساز.

## 2. نقشه کل سایت — نه فقط ماژول‌ها

هر تغییر باید روی کل سفر کاربر دیده شود. دامنه پوشش Audit و قرارداد کیفیت:

| لایه | موارد الزامی |
| --- | --- |
| هسته پلتفرم | identity، authentication/authorization، settings، extensions، feature state، shared services |
| دیتابیس و داده | مدل‌ها، constraints، index، search، schema parity، migration، backfill، archive |
| Backend/API | service boundaries، DTO، validation، policy/ownership، transaction، idempotency، rate limit، jobs |
| Frontend عمومی | home، صفحات بخش‌ها، لیست، جزئیات، search، profile، navigation، footer، SEO، responsive، RTL |
| پنل مدیریت | dashboard، منوها، فرم‌ها، جداول، actions، access، configuration، audit، preview |
| قالب و افزونه | lifecycle، contract، settings، contribution slots، theme builder، preview، update/rollback |
| تجربه‌های کاربر | ورود، ساخت/ویرایش محتوا، جست‌وجو، پخش/دانلود، تعاملات، خرید، پرداخت، پشتیبانی |
| عملیات | caching، observability، queue، security، backup/recovery، CI، deployment، error handling |

Audit را با فهرست واقعی مسیرها و مالک هر قابلیت بساز؛ به تعداد فایل یا پوشه به‌عنوان اثبات سلامت تکیه نکن.

## 3. قرارداد معماری و مالکیت

- **Modular Monolith** موجود را حفظ کن. هر دامنه، owner منطق کسب‌وکار، data model، validation، policy، API و presentation adapter خودش را داشته باشد.
- بخش مشترک را فقط در صاحب موجود آن توسعه بده: Identity/AuthZ، Media، Search، Settings، Notifications، Editor، Engagement، Moderation، Jobs، Audit، Billing و سایر ownerهای موجود. سیستم موازی نساز.
- استفاده میان‌دامنه‌ای فقط از public address/contract مالک؛ import مستقیمِ implementation و فایل خصوصی دامنه دیگر ممنوع.
- presentation و قالب تصمیم مالی/امنیتی/هویتی نگیرد. DTO و server boundary روشن باشد.
- data lifecycle و state machine روشن؛ نصب، فعال‌سازی، غیرفعال‌سازی، حذف کد و purge داده مراحل مستقل‌اند.
- API/Events در موارد نیاز stable/versioned باشند تا توسعه آینده موبایل، دسکتاپ، Messenger و integrations بدون هویت دوم ممکن باشد.
- از factory و abstraction فقط وقتی استفاده کن که reuse واقعی اثبات شده باشد؛ abstraction زودرس و تبدیل همه دامنه‌ها به EAV یا جدول عمومی ممنوع.
- هر تصمیم دارای trade-off مهم باید در ADR یا قرارداد مرتبط ثبت شود؛ اگر فقط اجرای قرارداد قبلی است ADR جدید نساز.

## 4. استاندارد طراحی و چیدمان کل سایت

### 4.1 Information Architecture و Navigation

- site map و مسیرهای پرتکرار کاربر را از routeهای واقعی استخراج کن. منوها، breadcrumb، footer، sidebar، search و URLها باید ساختار معنایی و consistent داشته باشند.
- معماری اطلاعات را از مدل دامنه نتیجه بگیر؛ صرفاً براساس تعداد دکمه‌ها یا UI mockup عمل نکن.
- سلسله مراتب بصری: heading واضح → context/action اصلی → ابزارهای کمکی → داده مرتبط. اطلاعات خطرناک یا به‌ندرت استفاده‌شده را از مسیر اصلی جدا کن.
- mobile-first و RTL واقعی (فاصله، آیکون جهت‌دار، ترتیب tab، grid، inputها)؛ keyboard/focus، semantic HTML، WCAG checks و reduced motion.
- loading، error، permission denied، empty، retry، unsaved changes، 404 و حالت‌های دسترس‌پذیری باید طراحی شوند.

### 4.2 Design System

- از token، typography، spacing scale، colors، surfaces، form control و composition فعلی SDS استفاده کن. component/base primitive جدید را فقط بعد از بررسی مشابه موجود بساز.
- تفکیک public UI و privileged Admin؛ تغییر قالب عمومی نباید ناخواسته UI امنیتی Admin را تغییر دهد.
- modal/drawer/tabs فقط با کاربرد روشن؛ جدول، sortable list و drag/drop باید با keyboard و گزینه جایگزین قابل استفاده باشند.
- assets/responsive images/lazy loading، CLS، hydration، browser compatibility، dark/light و localization را متناسب با تغییر بررسی کن.

## 5. قرارداد واجب هر صفحه/قابلیت/ماژول

برای هر حوزه‌ای که توسعه یا اصلاح می‌شود، در طراحی یا PR مشخص کن:

1. **Purpose & owner**: مسئله، دامنه، کاربران، ownership و وابستگی‌ها.
2. **Information hierarchy**: navigation، منوی پنل، layout صفحه، tabs/sections، breadcrumb و ترتیب عملیات.
3. **Entity model**: داده‌های اصلی، mandatory/optional، روابط، cardinality، constraints، indexing، قواعد lifecycle.
4. **Taxonomy & configuration**: تمایز نوع محتوا، دسته‌بندی درختی، ژانر، برچسب، ویژگی، واژگان و مقدار قابل تنظیم؛ owner و نحوه مدیریت در پنل.
5. **Admin list**: جست‌وجو، فیلتر، sort، pagination، ستون‌های قابل فهم، bulk actions امن، permission hints، empty/error states.
6. **Create/Edit flow**: فرم‌های مرتب، گروه‌بندی معنایی، فیلدهای شرطی، validation سمت سرور و کاربر، relational picker، media picker، unsaved changes، draft/preview/publish.
7. **Read/Public page**: نمایش مرتبط، SEO/metadata، responsive، performance، accessibility و fallback.
8. **Actions & workflow**: ایجاد، تغییر، حذف نرم/بازیابی در صورت نیاز، وضعیت، تأیید، انتشار، history و audit.
9. **Security**: نقش‌ها، section-specific permissions، ownership، CSRF/Origin، upload/download authorization، secret handling و rate limit.
10. **API & operations**: DTO، transaction، concurrency، idempotency، caching/invalidation، jobs، logging، observability.
11. **Extension points**: چه تنظیم، block، theme slot، hook یا plugin contribution قابل توسعه است و contract/version آن چیست.
12. **Verification**: test cases، regression، browser evidence، migration/compatibility و نتیجه واقعی اجرا.

اگر موردی لازم نیست، با دلیل «Not applicable» مشخص کن، نه اینکه از قلم بیفتد. خروجی برای همه ماژول‌ها ابتدا در قالب **inventory/contract matrix** باشد؛ اجرای هم‌زمانِ بازنویسی کل سایت ممنوع.

## 6. استاندارد پنل مدیریت: مرتب، تخصصی و قابل کنترل

**هر بخش فرم و مدیریت اختصاصی دارد، ولی الگوها مشترکند.** اجباری نیست همه حوزه‌ها تب‌های یکسان داشته باشند. ترتیب پیشنهادی و قابل انطباق:

- List page: عنوان و summary → جست‌وجو/فیلتر → action اصلی → جدول/کارت → pagination → وضعیت و خطا.
- Edit page: شناسه/عنوان/وضعیت → اطلاعات اصلی → جزئیات تخصصی → روابط → رسانه/فایل‌ها → انتشار و دسترسی → SEO/نمایش در صورت کاربرد → history/actions.
- Settings page: تنظیمات عمومی حوزه → تجربه نمایش/چیدمان → دسترسی/سیاست‌های مجاز → یکپارچگی‌ها → پیشرفته/ریسکی. راهنما، validation، preview، reset امن و audit متناسب.
- تغییر layout مانند block order، visibility، variant، density، display section، navigation placement و collection source (هرجا قرارداد پشتیبانی می‌کند) از پنل با schema typed و validation انجام شود.
- تنظیمات حساس مثل دسترسی، پرداخت، schema، migration و اجرای arbitrary code نباید در اختیار ویرایشگر عمومی یا یک JSON editor نامحدود باشد.
- خطاهای فرم، required mark، focus و ذخیره باید واضح باشد. لغو/ذخیره/پیش‌نمایش سازگار؛ hierarchy و اصطلاحات فارسی ثابت.
- مجوز واقعی سمت سرور enforce شود؛ پنهان‌کردن دکمه در UI کافی نیست.

## 7. تخصصی‌سازی دامنه‌ها — فقط نمونه، نه فهرست محدودکننده

- **Cinema**: فرمت اثر (فیلم/سریال/انیمه/مستند)، فصل و قسمت مطابق مدل موجود، عوامل و نقش، ژانر/دسته، ویدئو و رسانه، کیفیت، زبان/زیرنویس، پخش و دانلود، انتشار، ارتباطات و چیدمان؛ مدل `CinemaTitle`/`CinemaFormat`/`CinemaPerson`/`CinemaCredit`/`CinemaSeason`/`CinemaEpisode`/`MediaLink` موجود را پیش از پیشنهاد تغییر بررسی کن.
- **Music**: هنرمند/گروه، آهنگ، آلبوم، playlist، credit، cover، نسخه/فرمت، حق نشر، پخش/دانلود و ترتیب انتشار.
- **Games**: بازی، پلتفرم، نسخه/edition، requirement، فایل/patch، رسانه، دسته/تگ، سازگاری و روابط محتوا.
- **Software**: نرم‌افزار، سیستم‌عامل، نسخه، لایسنس، سازگاری، فایل/installer، changelog و محتوای مرتبط.
- **Magazine/Pages**: editor canonical، نویسنده، taxonomy، revisions، scheduling، SEO، صفحات و blockها.
- **Store/Checkout/Billing**: catalogue، variant، stock، price، order، payment، return، wallet؛ ledger و state claim اتمیک، بدون تغییر خودسرانه مقدار پول.
- **Community/Forum**: ساختار section→forum→subforum، topic/reply، moderation scoped، ownership، reputation و نمایش thread؛ قوانین فعلی انجمن را حفظ کن.
- **CRM/Users/Support/Forms/Automation**: شناسه انسانی واحد، contact غیر auth، role/permission، queues، case ownership، history، فرم‌ها، ارتباطات و jobs؛ سیستم موازی نساز.
- **Media/Search/SEO/Navigation/Analytics/Site settings**: سرویس‌های مشترک با schema، access، cache و presentation adapter روشن.
- **هر دامنه/ماژول دیگری که در repo کشف می‌شود**: همان قرارداد ۱۲ بندی با ساختار تخصصی واقعی خودش.

تنوع فرم باید از واقعیت دامنه بیاید: «ژانر» همیشه دسته‌بندی نیست؛ «Anime» ممکن است فرمت یا نوع اثر باشد؛ «بازیگر» موجودیت رابطه‌دار است، نه متن تکراری. وضعیت فعلی هرکدام را از schema و UI تأیید کن و migration سازگار پیشنهاد بده.

## 8. ویرایش و مدیریت قالب‌ها و افزونه‌ها مثل WordPress؛ مطابق معماری Next.js

**انتظار محصول:** مالک بتواند از Admin قالب/افزونه را ببیند، جست‌وجو کند، تنظیم کند، فعال/غیرفعال کند، وضعیت و ناسازگاری را ببیند، چیدمان ظاهری مجاز را ویرایش کند، preview بگیرد، نسخه/تاریخچه/rollback داشته باشد و بسته معتبر را مدیریت کند. قابلیت‌هایی که اکنون پشتیبانی نمی‌شوند باید Gap و Roadmap بگیرند؛ ادعای آماده‌بودن نکن.

**مرز اعتماد:**

- Declarative/Design themes: tokens، تنظیمات type-safe، بلوک‌ها، display rules، قالب‌های قابل پیکربندی و CSS sanitize شده از Admin/Studio، با draft/preview/publish/rollback و validation.
- Code themes و trusted code plugins: source code تنها پس از review، signature/integrity/compatibility validation، build، migrations، deployment و rollback ایمن فعال می‌شود. بارگذاری فایل JS/TS/PHP دلخواه به runtime سرور از پنل ممنوع.
- Untrusted extension: بدون isolation واقعی، resource limits، permissions و boundary سرویس، «sandboxed» محسوب نمی‌شود.
- با registry فعلی `src/platform/extensions` و owners در `src/modules/packages`/extension lifecycle، `src/themes` و `src/app/admin/{extensions,theme-builder,studio}` کار کن؛ نام مسیرها و API را هنگام اجرا دوباره تأیید کن.
- برای هر افزونه: manifest version/deps/permissions، setting schema، admin contributions، front-end slots، events، update/disable/uninstall، data retention و safe fallback.
- برای هر قالب: global/module assignment در صورت وجود contract، scoped tokens/CSS، template parts، RTL، preview، fallbacks، compatibility و isolation از منطق دامنه.
- افزونه غیرفعال نباید اثر سرور/queue غیرمجاز داشته باشد؛ غیرفعال‌سازی اختیاری داده را پاک نکند؛ purge فقط اقدام صریح و پرمجوز با backup/recovery.

**قانون محصول:** «مشابه وردپرس» یعنی تجربه مدیریت غنی، نه تکرار معماری PHP یا اجازه اجرای کد نامحدود از Admin. اگر ویرایش کد در پنل درخواست شد، آن را به فرایند نسخه‌دار و reviewed PR/build/deploy هدایت کن؛ ویرایش امن تنظیمات و قالب declarative را جداگانه قابل استفاده کن.

## 9. فیلدها، توسعه‌پذیری و Schema

- اطلاعات اصلی دامنه: ستون/جدول typed و relational با unique/foreign keys/index/constraints مناسب؛ JSON یا EAV عمومی جایگزین schema درست نیست.
- گزینه‌های انتخابی و taxonomy: تا حد امکان از ownerهای موجود مثل `taxonomy` و `vocabulary` با ownership و validation روشن استفاده کن؛ رکورد تکراری برای هر ماژول نساز.
- فیلدهای سفارشی در صورت نیاز واقعی: namespace/owner، تعریف typed و versioned، validation، permissions، searchable policy، defaults، migrations و migration/alias برای داده قدیمی.
- اضافه‌کردن نوع اثر/دسته/ویژگی باید از پنل (مطابق محدودیت schema) امکان‌پذیر باشد، بدون افزودن switch-case در ده‌ها فایل؛ اما «ایجاد نوع entity دلخواه» بدون مدل معتبر هدف نیست.
- change history، import/export و idempotency را طبق مالک فعلی یکپارچه کن؛ به schema و انتشار داده بدون بررسی backward compatibility دست نزن.
- SQLite توسعه و PostgreSQL تولید را با فایل‌های schema موجود، parity checks، manifest migrations و تست مرتبط هماهنگ نگه دار. `db push`/seed/restore روی دیتای موجود بدون اجازه و backup ممنوع.

## 10. استاندارد Backend، امنیت و Reliability

- سطح اتصال هر API: auth → resource scope/section-specific authorization → validated input → transaction/state claim → side effect/retry policy → audit/observability.
- برای عملیات مالی و وضعیت‌های هم‌زمان: conditional update/state claim، constraints، idempotency و مدل سازگار با `docs/agent/ARCHITECTURE.md`.
- محدودیت‌های حساس: strict rate limiting، Origin/CSRF برای state-changing requests، امنیت آپلود/دانلود، SSRF و path traversal، anti-XSS، CSP nonce، no secrets in logs.
- job/queue با مالکیت معلوم، retry/backoff، replay safety و invalidation؛ کار غیرفعال‌شده/لغوشده اثر ناخواسته نگذارد.
- مدیریت N+1، query select، index، pagination و cache براساس evidence و اندازه‌گیری؛ عدد performance هدف را حدس نزن.
- با سناریوی dependency failure، invalid config، corrupted data، unavailable Redis/Postgres و partial failures متناسب با feature برخورد کن.

## 11. شیوه کار اجباری Agent برای کل سایت

### فاز A — Audit صرفاً خواندنی

1. `git status`، branch/worktree و دستورالعمل‌ها را بررسی کن؛ تغییرات باز دیگران را حفظ کن.
2. نقشه موجودیت‌ها، routeها، module ownerها، extension/theme contracts و admin menu را از کد استخراج کن.
3. وضعیت هر معیار را با **Evidence path** تعیین کن: `Present / Partial / Missing / Unverified`. فرق «هدف سند» و «واقعیت runtime» را بنویس.
4. مشکلات را به `Critical / High / Medium / Low` با اثر، ریسک، dependency و scope تفکیک کن؛ ایجاد ticket تکراری نکن.
5. cross-cutting journeys را مشخص کن: login→content→search→player/download، browse→cart→pay→fulfilment، ticket/support، plugin/theme→settings→preview→publish.

**خروجی:** System Audit، Feature/Domain Matrix و شکاف‌های UI/DB/API/Security/Operations با مرجع فایل. هیچ مهاجرت یا refactor سراسری در این فاز انجام نده.

### فاز B — Blueprint و Roadmap

1. Target IA و design-system mapping، module boundary، admin form/navigation patterns، typed configuration، extension/theme management را طراحی کن.
2. برای هر پیشنهاد `reuse vs change vs new`، وابستگی، risk، compatibility و acceptance criteria مشخص کن.
3. تغییرات را به برش‌های کوچکِ قابل استقرار (vertical slices) اولویت‌بندی کن؛ اول اصلاحات سراسری کم‌خطر و قابل اندازه‌گیری، سپس دامنه‌های تخصصی.
4. به‌روزرسانی مستندات رسمی را در مسیر مصوب پروژه پیشنهاد بده؛ بدون هماهنگی تصمیم‌های مالک را بازنویسی نکن.

### فاز C — پیاده‌سازی مرحله‌ای در محدودهٔ درخواست و مجوز موجود

1. یک slice کوچک بردار؛ کد موجود و تست‌های مربوطه را بخوان.
2. در صورت نیاز spec/API/schema migration additive همراه fallback/rollback بنویس.
3. implementation را در owner صحیح با TypeScript strict، unit/integration/e2e مناسب و accessibility انجام بده.
4. قبل/بعد را با test، diff و browser evidence مقایسه کن؛ regression مسیرهای عمومی و ماژول‌های غیرفعال را بررسی کن.
5. فقط همان slice را جمع‌بندی کن؛ status واقعی و next step را در ledger/roadmap مناسب به‌روز کن.

**بدون مجوز مالک:** deploy production، تغییر secrets، purge داده، destructive migration، تغییر URL/permission/visual baseline، اضافه‌کردن dependency بزرگ، فعال‌کردن ماژول‌های کنارگذاشته‌شده ممنوع.

## 12. Test Matrix و Definition of Done

تست را فقط متناسب با تغییر و توان محیط انتخاب کن؛ اجرا نشده را «Pass» نزن. از scriptهای موجود در `package.json` استفاده کن و قبل از اجرا وجودشان را دوباره بررسی کن.

| تغییر | حداقل راستی‌آزمایی مناسب |
| --- | --- |
| فقط اسناد/اسکیل | ارجاع‌های معتبر، metadata معتبر، هماهنگی Codex/Claude و diff؛ بدون ادعای DB/browser/build |
| معماری/مرز دامنه | `npm run arch:check`، import/contract tests |
| TypeScript و API | `npm run typecheck` و تست مربوطه |
| schema/data | `npm run schema:check` / `npm run release:migrations`، تست DB متصل در محیط آماده |
| افزونه/قالب | `npm run extensions:generate` و تست lifecycle، compatibility، fallback |
| UI/UX | React Doctor طبق راهنمای پروژه، Playwright browser/a11y واقعی با viewportهای مناسب، snapshot approved |
| امنیت/عملیات | scoped security checks، permissions، negative tests، recovery path |
| release slice | `npm run check` و در صورت مناسب/آماده بودن `npm run build:postgres` و تست‌های متصل |

هیچکدام از checkها را با تغییر تست یا suppress بی‌دلیل دور نزن؛ بدون connection نمی‌توان ادعای test:pg یا test:redis کرد. دستورات خطرناک مثل `db:push`، import، restore و deploy:migrate روی دیتای واقعی اجرا نشوند مگر با مجوز، backup و rollback.

**Definition of Done برای هر slice:** مسئولیت درست، ساختار خوانا، Admin کاربردی، تعامل درست، سازگاری قرارداد، security، test evidence، SEO/RTL/mobile/accessibility در صورت ارتباط، سند به‌روز، بدون regression، و شفافیت «انجام شد / باقی مانده / تست نشد».

## 13. قالب خروجی اجباری برای هر Agent

برای Audit، Plan و هر PR/patch خروجی فارسی، کوتاه اما evidence-based بده:

- **Scope / وضعیت فعلی:** چه چیز بررسی شد؛ branch/worktree؛ چه چیزی موجود، ناقص یا نامشخص است.
- **Evidence:** فایل/مسیر/نمونه اجرا، نه برداشت از نام پوشه‌ها.
- **هدف چیدمان و معماری:** تغییرات UX/IA، روابط، API، dependencies و admin controls.
- **Plan:** برش‌های کوچک، ریسک/سازگاری، acceptance criteria، rollback.
- **Files changed:** فقط فایل‌های واقعاً تغییرکرده؛ و هر فایل مهم چرا.
- **Verification:** commands اجراشده + نتیجه واقعی + browser evidence + موارد اجرا نشده.
- **Next action:** کوچک‌ترین قدم بعدی. چیزی که تست نشده «کامل» اعلام نشود.

**اصل طلایی:** برای کل سایت یک استاندارد مشترک اجرا کن، اما هر زیرسیستم طراحی تخصصی و صاحب مشخص خودش را حفظ کند. نظم باید در مدل داده، کد، پنل، تجربه کاربر و عملیات قابل مشاهده و قابل آزمون باشد.
