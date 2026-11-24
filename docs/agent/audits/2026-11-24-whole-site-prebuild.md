## Scoped repair receipt — 2026-11-24

The owner authorized the three confirmed read/projection repairs plus Pay routing/
operations in `.mobocom/pay-routing-operations` over merged PR484/main bd6a218a.
CRM cross-department subject/status/timeline/count metadata, IRR/IRT-to-Toman
projection, and current personal-playlist track+album audience now have native
PostgreSQL and real session/browser proof. The historical reproductions below
remain evidence of the original audit, not current unresolved versions of those
three defects. [Exact files/checks/limits](../handoffs/MOBOCOM_PAY.md#routing-operations-and-confirmed-platform-repairs--2026-11-24).
Support ownership claim races, global CRM segment pagination, the older unit/native
fixture failures and broad release-readiness gaps remain open; no full-site build
or production validation was performed in this continuation.

# ممیزی سراسری پیش از بیلد — ۲۰۲۶/۱۱/۲۴

درخواست مالک: پیش از بیلد، کل پلتفرم از نظر کمبود و کار باقی‌مانده بررسی شود؛
سپس «تا همین‌جا» PR برای مرج مالک آماده شود. این گزارش اصلاح قابلیت‌ها نیست.
منبع کد: `eafa47f7` در `.mobocom/package-lifecycle`، شاخه
`feat/solution-packs-v2-2026-11-23`، روی main ادغام‌شدهٔ `78fe059c`.
کار root و autonomous-foundation و تنظیمات IDE حفظ شدند.

## دامنه و حد شواهد

- موجودی Git-visible: **۴۳۳ صفحه، ۴۹۱ handler API، ۷۴ owner دامنه و ۴۵ extension**.
  صفحات شامل ۲۲۱ Admin، ۴۶ حساب، ۱۴ Mini App و ۱۵۲ مسیر دیگرند؛ این شمارش،
  تعداد قابلیت مستقل یا اثبات سلامت تک‌تک مسیرهای dynamic نیست.
- قرارداد و سورس دامنه‌های زیر و handoffهای جدید بررسی شدند. جدول عمومی
  DOMAIN_CAPABILITY_MATRIX snapshot تاریخی اکتبر است؛ عبارت قدیمی «ناقص»
  بدون تطبیق با source/handoff جدید، یافتهٔ فعلی محسوب نمی‌شود.
- Graphify موجود stale بود؛ refresh با خطای ازقبل‌موجود
  `Out-of-corpus graph source: src/app/admin/ai/CredentialPools.tsx` شکست خورد.
  جست‌وجوی دقیق و خواندن source جایگزین شد؛ نتیجهٔ graph تازه ادعا نمی‌شود.
- سایت localhost3000 از mount مربوط به sms-platform قدیمی‌تر اجرا می‌شود؛
  آن runtime گواه اجرای HEAD جدید نیست. برای ممیزی، source جدید و Prisma5.22
  در runtime خصوصی با PostgreSQL17.11، UID1000، بدون .env و نقش NOSUPERUSER
  آماده شد. ۲۰۹ migration روی دیتابیس خالی جدا اعمال شد، نه دیتابیس سایت.
- فقط presentation عمومی SiteConfig برای حفظ **MoboCom Custom/custom-mobocom**
  در fixture کپی شد. دادهٔ واقعی کاربران کپی/تغییر نشد؛ قالب اصلی تغییر نکرد.

## وضعیت دامنه‌ها و blueprint ادامه

وضعیت «موجود» در این جدول حضور owner و consumer بررسی‌شده است؛
ProductionVerified یا تکمیل همهٔ گردش‌کارها نیست.

| حوزه | وضعیت و owner موجود | شکاف یا پذیرش بعدی |
|---|---|---|
| Identity/AuthZ | موجود؛ `identity/server/access.ts`، staff-guard و کلیدهای مستقل بخش‌ها | آزمون‌های نقش محدود و API مستقیم ادامه یابند؛ سیستم هویت یا resolver دوم ساخته نشود |
| گروه‌ها و محدودیت‌ها | عضویت انقضادار، benefits و restriction مشترک موجودند | primary/secondary precedence کاملِ قرارداد platform-evolution هنوز هدف است؛ با گروه فعلی اشتباه نشود |
| خانه/قالب/منو | SiteConfig، Studio، builder، custom theme و fallback موجودند | ظاهر تأییدشده حفظ شود؛ assignment مستقل قالب هر ماژول هنوز قابلیت آینده است |
| Pages/Journal/Editor | canonical document، draft/preview، revision، review، پیشنهاد و زمان‌بندی موجودند | تست قدیمی Journal با validation انتشار جدید همگام شود؛ editor یا review تازه لازم نیست |
| Cinema/Media | افراد/فصل/قسمت، فرمت، زیرنویس ASS، صدای جدا، Library و AAC اختیاری موجودند | provider/codec عمومی و host مقصد اثبات نشده؛ universal transcoding ادعا نشود |
| Music | هنرمند/آلبوم/credit، پلی‌لیست و تاریخچه موجودند | خواندن audience فعلیِ پلی‌لیست شخصی اصلاح شود؛ metadata موضوع یافته است، نه bypass پخش |
| Games | update/patch/DLC/edition و لینک‌های نسخه موجودند | نسخهٔ خلاصه پس از حذف/تغییر نوع آخرین update به‌صورت محدود بازتولید شود |
| Software | release تاریخی، channel، checksum و OS/CPU targets موجودند | فرم release به claim نسخه/updatedAt برای جلوگیری از lost update نیاز دارد |
| Forum/Community/Businesses | poll، پیام، split/move، scope moderation، review و claim کسب‌وکار موجودند | پذیرش چندنفرهٔ جاری؛ request lease/notification کسب‌وکار ادامهٔ اختیاری است |
| Store/Inventory | variant، قیمت، cart، انبار، خرید/دریافت/شمارش، فروش آنلاین/حضوری موجودند | regressionهای انبار و buyer journey روی نسخهٔ انتشار؛ ابزار/چاپگر/provider واقعی جداست |
| Orders/Returns/Billing/Wallet | بسته‌بندی/تحویل/مرجوعی/ضمانت، فاکتور و provenance کیف پول موجودند | مبلغ و تاریخچه بازنویسی نشود؛ ثبت اپراتور cash/card با اجرای بانک یکسان نیست |
| MoboComPay | پذیرنده/ترمینال، API، OTP، receipt/درگاه مشترک و گزارش موجودند | بانک/پیامک/callback واقعی و دو migration در unreleased، کار rollout هستند |
| CRM/Support | پروندهٔ مشتری حساب‌محور، tag/note/timeline، segment، چت و تیکت موجودند | scope دپارتمان، claim مالکیت، تبدیل ارز و pagination؛ CRM کامل Contact/Deal/Pipeline هنوز جزئی است |
| Forms/Repair | فرم پولی/نوبت، handler، رسید، PIN، فاکتور تعمیر و رضایت موجودند | تحویل durable webhook عمومی و provider واقعی؛ consent migration در1.7.21 ثبت است |
| Automation/Notifications/Jobs | صف و receipt مشترک و چهار journey CRM موجودند | claim-before-effects موتور عمومی و webhook یک‌بارمصرف، نیازمند برش دوام‌اند؛ صف دوم ساخته نشود |
| Search/SEO/Imports | index، visibility، typo، facets، permalink و import ownerها موجودند | اندازه‌گیری دادهٔ مقصد/منبع واقعی؛ سقف۵۰۰۰ تصمیم مالک است، نقص نیست |
| AI/Integrations/API | routing/readiness و secret handling؛ bearer/current-user در API عمومی موجود است | configured با live tested فرق دارد؛ قرارداد کامل /api/v1 قدیمی باز است، Pay OpenAPI موجود است |
| Packages/Repository | lifecycle/compatibility/recovery و Solution Pack v2 موجودند | توزیع تجاری مستقل، upgrade و entitlement در مقصد باید تمرین شوند |
| Operations/Release | backup/restore، updater و migration manifest موجودند | build همین نسخه، populated upgrade، backup restore و rollback مقصد اجرا نشده‌اند |

Blueprint، توسعهٔ همین ownerهاست: یک canonical identity؛ projection دارای scope
هر owner؛ claim وضعیت/مالک/updatedAt پیش از اثر؛ revision/Audit در همان commit؛
قرارداد API نسخه‌دار؛ UI روی SDS/قالب موجود و وضعیت خطا/تداخل واضح. منطق پول،
مجوز یا کسب‌وکار وارد theme یا generic JSON editor نشود.

## اولویت‌های تأییدشده

### P1 — پیش از اعلام آمادگی انتشار

1. **CRM موضوع/وضعیت تیکت دپارتمان غیرمجاز را برمی‌گرداند — بازتولید شد.**
   `livechat/server/http/livechat.ts:174` کارمند دارای tickets.handle را می‌پذیرد؛
   `livechat/server/livechat.ts:335` تیکت‌های مشتری را فقط با userId می‌گیرد.
   در fixture دو دپارتمان، guard اصلی Support دسترسی به B را رد کرد ولی
   GET CRM با200، subject/status آن را در timeline/count برگرداند.
   شاهد قرارداد: `support/server/department-access.ts:21` و
   PLATFORM_DECISIONS قرارداد دپارتمان. بدنهٔ تیکت افشا نشده/ادعا نشده است.
   نمایش کلی wallet/chat به‌خودی‌خود یافتهٔ مجزا نیست؛ ADMIN_ORGANIZATION
   اجازهٔ CRM به کارکنان تیکت را صریحاً داده است.

2. **audience فعلی در پلی‌لیست شخصی موسیقی رعایت نمی‌شود — بازتولید شد.**
   `music/server/personal-playlists.ts:26` فقط انتشار/تاریخ را در read بررسی
   می‌کند؛ add در همان owner محتوای محدود را رد می‌کند. آهنگ عمومی ذخیره شد،
   سپس محدود شد، ولی عنوان/مشخصاتش همچنان برگردانده شد.
   مسیر صوت در `media/server/links.ts:186` opensItem دارد؛ bypass پخش ادعا نیست.
   روابط کاربر حذف نشوند؛ projection با audience فعلی هماهنگ شود.

3. **مالکیت تیکت در race قابل اتکا نیست — شواهد کد، آزمون هم‌زمان اجرا نشده.**
   PATCH در `support/server/http/admin/tickets/route.ts:64–80` مالک را می‌خواند،
   سپس id-only update می‌زند. پاسخ تیکت هم از snapshot پیش از transaction
   استفاده می‌کند. دو take/reply یا reassignment هم‌زمان به claim نیاز دارند.
   یادداشت داخلی همکار باید همچنان مجاز بماند.

4. **گیت تست سراسری سبز نیست.** اجرای واقعی test:site در حالت PostgreSQL:
   **۱۱۱۱ آزمون،۱۱۰۹ موفق،۲ ناموفق،۰ skip**.
   `content-controls.test.cjs:1369` هنوز فهرست maintenance بدون mobocom-pay
   انتظار دارد؛ `store.test.cjs:159` شبیه‌ساز tx بدون $queryRaw دارد، درحالی‌که
   مسیر PostgreSQL قفل کالا می‌گیرد. فایل‌های مرتبط با main یکسان بودند.
   خطای دوم به branch PostgreSQL fixture مربوط است؛ نقص موجودی اثبات نشده و
   قفل واقعی محصول نباید برای گذشتن تست حذف شود.
   پنج regression متصل دیگر نیز به fixture/loader قدیمی می‌خورند؛ پایین ثبت‌اند.

### P2 — برش‌های تکمیلی پس از موارد بالا

- **ارزش خرید CRM — بازتولید شد:** جمع totalMinor برای IRR/IRT در
  `livechat/server/livechat.ts:313–324,378–388` به‌عنوان تومان مصرف می‌شود.
  سفارش۱٬۰۰۰٬۰۰۰ریالی،۱٬۰۰۰٬۰۰۰تومان برگشت؛ انتظار۱۰۰٬۰۰۰تومان است.
  فقط projection/AOV اصلاح شود، پول تاریخی دست نخورد. segment فعلی بر
  تعداد/recency تکیه دارد؛ خطای هدف‌گیری کمپین از این مورد نتیجه نمی‌شود.
- CRM ابتدا۶۰ مشتری جدید را می‌گیرد و سپس segment را فیلتر می‌کند؛
  `livechat.ts:375,390`. pagination/filter قبل از محدودسازی لازم است.
- Software release در `software/server/releases.ts:70–76` id-only update دارد
  و فرم updatedAt نمی‌فرستد؛ CAS و پیام409، بدون history engine تازه.
- Games خلاصهٔ version را پس از ذخیره بیرون transaction تغییر می‌دهد و delete
  بازسازی نمی‌کند؛ `games/server/admin.ts:338–366`،
  `media/server/queries/games.ts:102–120`. ابتدا حذف/تبدیل به DLC و نسخهٔ دستی
  تاریخی تفکیک و بازتولید شوند؛ پاک‌کردن سراسری version مجاز نیست.
- Automation عمومی processedAt را پیش از effects می‌نویسد؛
  `automation/server/engine.ts:366–377`. webhook فرم fire-and-forget است؛
  `forms/server/advanced.ts:95–109`. برش receipt/retry در Jobs موجود؛
  این شکاف به journeyهای durable CRM تعمیم داده نشود.
- Marketplace در نبود state صریح، manifest پیش‌فرض روشن دارد؛ legacy خاموش
  حفظ می‌شود. اولویت تنظیم نصب/پک با بخش‌های کنارگذاشته‌شده بازبینی شود؛
  manifest به‌تنهایی آسیب امنیتی یا مجوز تغییر تنظیم فعلی نیست.

## آزمون‌های واقعاً اجراشده و حد مرورگر

- معماری و parity SQLite/PostgreSQL گذشتند؛ manifest شامل۲۳ release و دو
  migration unreleased مربوط به Pay است. هر۲۰۹ migration روی DB خالی جدا گذشت.
- PostgreSQL: scoped-restrictions، cart-checkout-snapshot، return-refund-integrity،
  editor-page-documents، forum-category-moderators، solution-packs-v2 گذشتند.
- loaderهای global-authentication، section-maintenance، inventory-hold-expiry،
  money-state-rules به import نسبی/alias جدید نمی‌رسند؛ Journal review fixture
  cover/excerpt/category/short الزامی انتشار را ندارد. این‌ها pass یا خرابی قطعی
  محصول اعلام نمی‌شوند؛ fixture اصلاح و رفتار واقعی دوباره آزمایش شود.
- دو تست Pay ابتدا نام DB عمومی را طبق guard خود رد کردند؛ بدون تغییر guard،
  DB جدا با پیشوند مجاز mobocom_pay_test ساخته شد و **هر دو تست گذشتند**.
- سه probe بومی با دیتابیس واقعی، CRM scope/ارز و metadata پلی‌لیست را بازتولید
  کردند. این‌ها «اثبات یافته» هستند، نه تست پذیرش قابلیت سالم.
-۷۵ مشاهدهٔ page-load در1440/390 و روشن/تیره ذخیره شد؛۷۴ مربوط به مسیر واقعی
  است. /community probe غیرcanonical بود؛ /businesses خاموش404 انتظار می‌رود.
  در DOMهای نمونه‌برداری‌شده axe/overflow/page-error ثبت نشد، اما بسیاری از
  Admin/account captureها هنوز loading shell بودند. فقط دو نمای Extensions
  به‌طور صریح منتظر کارت آماده شدند؛ بقیهٔ Adminها پذیرش کامل UI محسوب نمی‌شوند.
  این محدودیت در بازبینی تصویر مشخص شد و **ادعای۷۵ UI کامل/سالم نمی‌شود**.
  سه خطای گذرای navigation هنگام memory-restart خود Next dev با همان source
  دوباره اجرا و رفع شدند. screenshot خانهٔ Custom و loading shell بررسی شد.
- بیلد، flow همهٔ فرم‌های dynamic، تمام‌سایت WCAG، provider واقعی و استقرار
  اجرا نشدند. نتیجهٔ محدود Solution Pack v2 در receipt اختصاصی آن مستقل است.

## ترتیب اجرای بعدی، پذیرش و rollback

1. **برش اول:** scope تیکت CRM و claim مالکیت Support، با ownerهای فعلی.
   فایل‌های هدف: livechat/server/livechat.ts و Support department-access/handlers؛
   بدون تغییر ظاهر، هویت یا schema.
   پذیرش: دو دپارتمان/دو نقش؛ CRM و API مستقیم فقط دادهٔ مجاز؛ مدیر scope کامل؛
   take/reply/reassign هم‌زمان با یک برنده/یک409، پیام و claim اتمیک،
   و یادداشت داخلی مجاز. fixtureهای مربوط و تست سراسری دوباره اجرا شوند.
   rollback: مصرف CRM معیوب محدود/غیرفعال شود؛ scope ضعیف بازگردانده نشود؛
   دادهٔ تیکت، پیام و Audit حفظ شوند.
2. audience موسیقی و تبدیل ارز CRM؛ PostgreSQL+API و UIِ واقعاً آماده.
3. fixtureهای regression، CAS نرم‌افزار و version بازی؛ سپس دوام webhook عمومی.
4. build نسخهٔ نهایی، upgrade دادهٔ موجود و backup/restore/rollback مقصد.
5. توزیع تجاری مستقل و اتصال providerهای انتخاب‌شده؛ هرکدام شاهد مستقل.

Contact/Organization/Lead/Deal/Pipeline/Activity/Task هدف گستردهٔ CRM هستند و
در مدل فعلی به شکل کامل وجود ندارند؛ این توسعهٔ محصول جداست، نه مانع فنی هر
بیلد. قالب هر بخش، قرارداد کامل /api/v1، یادآوری تاریخ فیلم و notification
درخواست کسب‌وکار نیز backlog نام‌دارند؛ بدون تصمیم مالک هم‌زمان ساخته نشوند.

[رسید ماشین‌خوان ممیزی](2026-11-24-whole-site-prebuild.json) دادهٔ مشاهده،
بازآفرینی خطاها و cleanup را نگه می‌دارد. هیچ اصلاح محصول، تغییر قالب،
provider-send، workflow میزبانی‌شده، merge یا deploy در ممیزی انجام نشد.

## پایان محیط ممیزی

۴۲۲۵ از۴۲۲۶ ورودی با runtime یکسان بود؛ تنها تغییر runtime، تبدیل خودکار
compilerOptions.jsx از preserve به react-jsx توسط Next dev در tsconfig بود.
source مخزن تغییر نکرد؛ برابری کامل config ادعا نمی‌شود. runtime/Prisma خصوصی،
هر دو DB جدا و نقش آن‌ها، نشست‌ها و presentation/archive خصوصی پاک شدند؛
readiness و session سایت اصلی دوباره۲۰۰ بودند. شواهد غیرمحرمانه در var/whole-site-audit-20261124
ignored مانده‌اند. اصلاح یافته‌ها و پذیرش کامل فرم‌های Admin هنوز کار بعدی‌اند.
