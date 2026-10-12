> سند تاریخی؛ راهنمای فعلی نصب و معرفی پروژه در [README](../../README.md) است.

# MoboComCMS 🛡⚡

## استودیوی سایت و طراحی Noir

ظاهر تیره با سبز نئونی، چیدمان واکنش‌گرا، بخش‌های صفحه اصلی قابل ویرایش و مرتب‌سازی، مدیریت منو و برند، سه قالب آماده و واردکردن قالب JSON، ساختار افزونه مستقل، فرم‌ساز و صندوق خصوصی پاسخ‌ها اضافه شده‌اند.

- استودیو: `/admin/studio`
- فرم‌ساز: `/admin/forms`
- راهنمای استفاده و توسعه: [docs/SITE-STUDIO.md](../../docs/SITE-STUDIO.md)
- ساخت افزونه، قالب و ماژول (با نمونهٔ کامل): [docs/DEVELOPERS-FA.md](../../docs/DEVELOPERS-FA.md)
- نصب از مرورگر و به‌روزرسانی از پنل: بخش‌های «نصب از مرورگر» و «به‌روزرسانی از پنل مدیریت» در [DEPLOY-FA.md](../../DEPLOY-FA.md)
- قالب نمونه قابل نصب: [public/themes/example.json](../../public/themes/example.json)
- آزمون‌های منطق فرم و تنظیمات: `npm run test:site`
- آزمون یکپارچه روی سرور محلی: `node --env-file=.env scripts/site.integration.cjs`

قالب JSON هویت بصری را نصب می‌کند. افزونه‌های React به‌صورت ماژول مستقل در پروژه ثبت و هنگام build نصب می‌شوند؛ اجرای کد آپلودشده از پنل در این نسخه وجود ندارد.

نسخه production روی شاخه پشتیبانی‌شده Next.js 15 با React 19 آماده شده است. وضعیت نسخه‌ها و سیاست ارتقا در [docs/DEPENDENCY-AUDIT.md](../../docs/DEPENDENCY-AUDIT.md) ثبت می‌شود.

فروشگاه حرفه‌ای فروش اشتراک VPN با پنل مشتری، CRM و پنل ادمین کامل — متصل به پنل‌های **Remnawave** و **PasarGuard** (بر پایه XrayCore) با درگاه پرداخت رمزارزی **Plisio**.

## امکانات

### فروشگاه
- لندینگ حرفه‌ای فارسی (RTL) با تم تیره
- نمایش پلن‌ها و خرید با پرداخت رمزارزی (BTC, USDT, LTC و...)
- تسویه idempotent پرداخت و تحویل از طریق durable fulfillment job؛ callback درگاه provisioning خارجی را inline اجرا نمی‌کند
- کاتالوگ محصول مجازی و فیزیکی با دسته‌های درختی، گروه مشخصات مخصوص هر خانواده و گونه‌های دارای قیمت و موجودی مستقل (`/admin/products`، `/admin/productcats`، `/admin/productgroups`)
- صفحه محصول با گالری و هفت بخش بدون بارگذاری مجدد؛ دیدگاه و امتیاز فقط برای خریدار با سفارش و فاکتور پرداخت‌شده، پرسش برای تمام اعضا و تأیید هر دو در `/admin/product-feedback`
- سفارش فیزیکی با نشانی گیرنده؛ تحویل دستی سفارش‌های پرداخت‌شده در `/admin/product-deliveries`، شامل کد رهگیری و اطلاعات مجازیِ رمزنگاری‌شده که فقط در فاکتور خریدار نمایش داده می‌شود
- پیش از انتشار این تغییر، مهاجرت `20260925150000_professional_store` را روی PostgreSQL اعمال کنید. `STORE_DELIVERY_KEY` اختیاری است؛ اگر خالی باشد کلید معتبر `PANEL_CREDENTIAL_KEY` برای رمزنگاری اطلاعات محصول مجازی استفاده می‌شود.

### پنل مشتری
- مشاهده اشتراک‌ها با ترافیک، انقضا و لینک رمزگذاری‌شده اختصاصی Happ
- سینک زنده آمار از پنل VPN
- تاریخچه سفارش‌ها
- تیکت پشتیبانی

### مدیریت مالی، فاکتور و درگاه پرداخت (جدید)
- **داشبورد مالی**: درآمد ناخالص، سود خالص، هزینه‌ها، کارمزد درگاه، میانگین سفارش، نمودار درآمد ماهانه، تفکیک درآمد به درگاه و پلن، مشتریان برتر
- **فاکتورها**: صدور فاکتور (پلن / محصول / مبلغ دلخواه)، تخفیف و مالیات، ثبت پرداخت، ابطال، استرداد، فاکتور قابل چاپ و PDF با شماره‌گذاری اتمیک و یکتا (`HV-2026-000001`)
- **درگاه‌های پرداخت**: تعریف چند درگاه (Plisio و پرداخت دستی کارت/کیف‌پول)، انتخاب درگاه پیش‌فرض، ذخیره‌سازی کلیدها به‌صورت ماسک‌شده، تست اتصال، هشدار «تنظیمات ناقص»
- **تراکنش‌ها (Ledger)**: ثبت هر کال‌بک درگاه و تسویه دستی با شناسه تراکنش، ارز، مبلغ کریپتو و کارمزد
- **هزینه‌ها**: ثبت هزینه سرور/تبلیغات/حقوق/کارمزد برای محاسبه سود واقعی
- **پنل مشتری**: لیست فاکتورها، مبلغ پرداخت‌نشده و صفحه فاکتور با دستور پرداخت

### پنل ادمین + CRM
- داشبورد آماری (درآمد، مشتری، سفارش، اشتراک فعال)
- مدیریت مشتریان با جستجو، مسدودسازی، تغییر نقش و یادداشت‌های CRM
- مدیریت اشتراک‌ها: تمدید، غیرفعال/فعال، ابطال، سینک با پنل
- مدیریت سفارش‌ها: تایید دستی پرداخت (ساخت خودکار اشتراک)
- مدیریت پلن‌ها با اتصال به پنل VPN دلخواه
- مدیریت پنل‌های VPN با تست اتصال
- تیکت‌های پشتیبانی (پاسخ، بستن، بازگشایی)
- تنظیمات برند و سایت
- نقش‌های آماده: `admin`، `accountant` (حسابدار)، `support`، `reseller`، `backup` — با دسترسی `finance.manage` / `invoices.manage` / `gateways.manage`
- تغییر سطح دسترسی نقش‌ها بدون نیاز به ورود مجدد اعمال می‌شود
- **Audit Log** برای عملیات حساس ادمین با actor، target، request ID، IP و metadata پاک‌سازی‌شده (`/admin/audit`)

## نصب و راه‌اندازی

پیش‌نیاز توسعه: **Node.js 20.9+**؛ Docker production از Node.js 22 استفاده می‌کند.

```bash
# ۱. تنظیم محیط
cp .env.example .env
openssl rand -hex 32  # مقدار NEXTAUTH_SECRET
# برای ساخت اولیه ادمین، ADMIN_EMAIL و ترجیحاً ADMIN_PASSWORD را هم تنظیم کنید.

# ۲. نصب دقیق وابستگی‌های قفل‌شده
npm ci

# ۳. ساخت دیتابیس توسعه SQLite و seed
npm run db:push
npm run db:seed

# ۴. اجرا
npm run dev
```

- سایت توسعه: `http://localhost:3000`
- credential ثابت داخل سورس وجود ندارد. اگر روی دیتابیس خالی `ADMIN_PASSWORD` ندهید، seed یک رمز قوی تصادفی تولید و فقط همان بار چاپ می‌کند.
- کاربر/فروش/هزینه دمو فقط با `SEED_DEMO_DATA=true` ساخته می‌شود؛ در production این گزینه باید `false` بماند.
- برای production از Docker + PostgreSQL و راهنمای [docs/DEPLOY-COOLIFY.md](../../docs/DEPLOY-COOLIFY.md) استفاده کنید. دیتای production از container کد جدا نگه داشته می‌شود.

### اسکریپت‌ها

| دستور | کار |
|---|---|
| `npm run dev` | اجرای محیط توسعه روی پورت ۳۰۰۰ |
| `npm run build` | بیلد با Prisma schema توسعه SQLite |
| `npm run build:postgres` | بیلد production با Prisma client PostgreSQL |
| `npm start` | اجرای بیلد production |
| `npm run typecheck` | بررسی تایپ‌ها (`tsc --noEmit`) |
| `npm run release:check` | تمام gateهای معماری، schema، money، i18n، regression و typecheck |
| `npm run extension:new -- affiliate` | ساخت scaffold افزونه جدید |
| `npm run theme:new -- editorial` | ساخت scaffold code-theme جدید |
| `npm run extensions:generate` | اعتبارسنجی manifestها و ساخت registryهای generated |
| `npm run db:push` | اعمال اسکیمای Prisma روی SQLite |
| `npm run db:seed` | داده پایه + ادمین اولیه؛ demo data فقط با `SEED_DEMO_DATA=true` |

### معماری و ساختار پروژه

معماری هدف **Modular Monolith** است؛ `app/` فقط لایه delivery/composition است و business logic جدید نباید داخل page/route نوشته شود. Prisma هم نباید قرارداد UI یا domain باشد. جزئیات و قوانین وابستگی در [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) ثبت شده است.

```
src/
├─ app/                         # Next.js delivery: pages, layouts, route handlers
├─ modules/                     # business capabilities
│  ├─ identity/                 # auth, session, RBAC
│  ├─ catalog/                  # plans/products; domain + application + infrastructure
│  ├─ billing/                  # invoices, gateways, payment integration
│  ├─ wallet/                   # wallet ledger and balance operations
│  ├─ subscriptions/            # subscription lifecycle + provisioning orchestration
│  ├─ providers/                # Remnawave / PasarGuard adapters
│  ├─ reseller/                 # reseller policy and operations
│  ├─ notifications/            # Telegram and future notification adapters
│  ├─ public-api/               # API-key and v1 support
│  └─ site/                     # CMS/site config/SEO/public view models
├─ platform/                    # database, config, HTTP and extension contracts
├─ shared/                      # framework-free shared primitives
├─ components/                  # shared/legacy UI; feature UI migrates into modules/*/ui
├─ plugins/                     # bundled plugin implementations
├─ themes/                      # bundled themes
└─ lib/                         # compatibility re-exports only; do not add new logic here
prisma/                         # SQLite dev schema + PostgreSQL parity schema + safe seed
scripts/                        # tests + architecture boundary checks
```

برای کنترل معماری:

```bash
npm run arch:check
npm run check
```

`arch:check` اجازه نمی‌دهد dependency خلاف جهت داخل domain/application اضافه شود و دسترسی مستقیم جدید از `app/` به دیتابیس را هم رد می‌کند.

برای release/cutover: [docs/RELEASE-CHECKLIST.md](../../docs/RELEASE-CHECKLIST.md)، [docs/FINAL-STATUS.md](../../docs/FINAL-STATUS.md) و [docs/POSTGRESQL-CUTOVER.md](../../docs/POSTGRESQL-CUTOVER.md).


### افزونه و قالب

افزونه‌های کدنویسی‌شده زیر `src/plugins/<id>` و code-themeها زیر `src/themes/code/<id>` قرار می‌گیرند. registryها خودکار ساخته می‌شوند و فایل generated نباید دستی تغییر کند. فعال/غیرفعال‌کردن و تنظیمات افزونه‌ها از `/admin/extensions` انجام می‌شود و از Site Studio مستقل است.

- افزونه‌ها می‌توانند UI slot، API namespaced، event handler، durable job، permission، admin navigation، setting و KV storage مستقل داشته باشند.
- code-themeها می‌توانند Header/Footer/Home را override کنند و در صورت نبود override به renderer اصلی fallback می‌کنند.
- runtime themeهای JSON فقط design token هستند و کد دلخواه اجرا نمی‌کنند.
- Plugin/Theme اجازه import مستقیم Prisma/DB یا private server internals هسته را ندارند؛ `arch:check` این مرز را enforce می‌کند.

راهنمای کامل: [docs/EXTENSIONS.md](../../docs/EXTENSIONS.md) و [docs/THEMES.md](../../docs/THEMES.md).

## درگاه پرداخت

از پنل ادمین → **مالی → درگاه‌های پرداخت**:

1. یک درگاه `Plisio` بسازید و `API Key` + `Secret Key (IPN)` را از حساب Plisio وارد کنید؛ در حالت پیش‌فرض همان مقدار `.env` را هم به‌عنوان فول‌بک می‌خواند.
2. آدرس کال‌بک در پنل Plisio: `https://<domain>/api/payment/plisio/webhook`
3. برای کارت‌به‌کارت/کیف‌پول: درگاه از نوع **پرداخت دستی** بسازید و دستور پرداخت را بنویسید؛ مشتری روی صفحه فاکتور آن را می‌بیند و شما در پنل «ثبت پرداخت» می‌زنید.
4. تا وقتی هیچ درگاهی «قابل استفاده» نباشد، پنل ادمین هشدار می‌دهد و خرید با پیام واضح متوقف می‌شود.

## درگاه پرداخت ارزی ریالی (FrenzyEx)

برای پرداخت کارت‌به‌کارت ایرانی، در پنل ادمین یک درگاه از نوع **FrenzyEx / درگاه پرداخت ارزی ریالی** بسازید و `API Key` و `Callback Secret` را فقط سمت سرور نگه دارید. Callback عمومی HTTPS باید روی این مسیر باشد:

```text
https://<domain>/api/payment/frenzyex/webhook
```

رفتار production این integration:

- ایجاد پرداخت با `POST /api/v1/payment-requests` و `payment_method=standard` انجام می‌شود؛ مبلغ provider همیشه TMN است.
- fulfillment فقط بعد از callback معتبر HMAC یا status polling احراز‌شده با `status=paid` انجام می‌شود.
- `request_id`، `order_ref`، مبلغ و ارز قبل از settlement دقیقاً با رکورد محلی تطبیق داده می‌شوند.
- اگر callback گم یا دیر شود، worker داخلی با `GET /api/v1/payment-requests/{request_id}` وضعیت را reconcile می‌کند.
- درخواست create بعد از timeout مبهم **خودکار تکرار نمی‌شود**؛ چون API v1 idempotency-key ندارد و retry کور می‌تواند checkout دوم بسازد. این موارد در خروجی worker به‌صورت `untracked` دیده می‌شوند و باید با merchant panel بررسی شوند.
- درخواست‌های `expired` یا `canceled` محلی هم VOID می‌شوند، wallet credit رزروشده برمی‌گردد و inventory reservation آزاد می‌شود. اگر `expires_at` گذشته ولی provider هنوز `pending` باشد، worker ابتدا cancel کنترل‌شده می‌فرستد و در conflict دوباره status را می‌خواند.

### Worker پرداخت و fulfillment

همان endpoint داخلی fulfillment حالا reconciliation پرداخت را هم **قبل از** retry تحویل سرویس و آزادکردن reservation اجرا می‌کند:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $INTERNAL_JOBS_SECRET" \
  "https://<domain>/api/internal/fulfillment/run?limit=50"
```

در production این endpoint را با cron/systemd یا scheduler حداقل هر ۱ دقیقه اجرا کنید. پاسخ شامل `payments`, `fulfillment` و `releasedReservations` است. وجود `payments.failed` یا `payments.untracked` باید مانیتور/alert شود.

## اتصال پنل‌های VPN

از **پنل ادمین → پنل‌های VPN** یک پنل جدید اضافه کنید:

| نوع | اعتبار | توضیح |
|---|---|---|
| **Remnawave** | API Token (Bearer) | از داشبورد Remnawave → Settings → API Tokens |
| **PasarGuard** | نام کاربری + رمز ادمین | همان API سازگار مارزبان (`/api/admin/token`) |

سپس در **پلن‌ها** پلن‌ها را به پنل مقصد متصل کنید. بعد از هر پرداخت موفق:
1. کاربر روی پنل VPN ساخته می‌شود (با ترافیک و مدت پلن)
2. رکورد اشتراک با لینک اختصاصی ساخته می‌شود
3. durable fulfillment job با retry/lease عملیات پنل را انجام می‌دهد و مشتری بعد از تکمیل، لینک اشتراک را می‌بیند

### گروه‌ای که کانفیگ را می‌سازد (مهم)

هیچ‌کدام از این دو پنل به‌تنهایی به کاربر کانفیگ نمی‌دهد؛ کاربر باید به یک **گروه** وصل باشد، وگرنه اکانتش ساخته می‌شود ولی لینک اشتراکش **هیچ کانفیگی ندارد**:

| پنل | نام گروه | چیزی که موقع خرید فرستاده می‌شود |
|---|---|---|
| Remnawave | Internal Squad | `activeInternalSquads` (UUID اسکوادها) |
| PasarGuard | Group / Service | `group_ids` (شناسه گروه‌ها؛ هر گروه `inbound_tags` خودش را دارد) |

- در **پنل‌های VPN → ویرایش پنل** روی دکمه «🔎 خواندن … از پنل» بزنید و گروه‌ها را کلیک کنید تا انتخاب شوند (برچسب فیلد برای هر پنل متفاوت است).
- اگر خالی بگذارید: برای Remnawave نام‌های فیلد «اینبانددها» به‌عنوان نام اسکواد امتحان می‌شوند، سپس اسکواد `Default`؛ برای PasarGuard گروهی با نام `Default`/`Main` و در غیر این صورت اولین گروه.
- اگر پنل هیچ گروهی نداشته باشد، خرید با پیام واضح رد می‌شود و مبلغ به کیف پول مشتری برمی‌گردد (اشتراک بی‌کانفیگ فروخته نمی‌شود).
- اشتراک‌های قدیمی که بدون گروه ساخته شده‌اند، با اولین **همگام‌سازی** (باز شدن پنل کاربری) یا هر عملیات (تمدید/غیرفعال‌سازی) گروه خودکار می‌گیرند.
- نسخه‌های قدیمی مارزبان (بدون گروه) هم پشتیبانی می‌شوند: در فیلد اینبانددها `پروتکل:تگ` بنویسید (مثل `vless:VLESS-REALITY,vmess:VMess-WS`).
- لینک ساب canonical از خود VPN Panel (`panelSubUrl`) گرفته می‌شود. MoboComCMS آن URL را سمت سرور با crypt5 رمزگذاری می‌کند و فقط `happ://crypt5/...` را در سایت، Mini App، بات، QR و APIهای customer-facing نمایش می‌دهد؛ دامنه سایت منبع لینک جدید نیست و در خطای encryption هیچ raw URLای fallback نمی‌شود.

## درگاه Plisio

1. در [Plisio](https://plisio.net) ثبت‌نام و از **API → API settings** مقدار `SECRET_KEY` را بردارید.
2. در `.env` قرار دهید: `PLISIO_API_KEY` و `PLISIO_SECRET_KEY`
3. `PLISIO_CURRENCIES` را مثلاً `BTC,USDT,LTC,TON` بگذارید.
4. Webhook به‌صورت خودکار روی `/api/payment/plisio/webhook` ارسال می‌شود (امضا با HMAC-SHA1 تایید می‌شود).
5. حتماً `siteUrl` را در تنظیمات ادمین روی دامنه واقعی بگذارید تا callback درست ساخته شود.

## کیف پول مشتری

- هر کاربر موجودی کیف پول دارد و **هر تغییر موجودی در دفتر تراکنش‌ها (`WalletTx`) ثبت می‌شود** تا همیشه قابل ردیابی باشد.
- شارژ کیف پول با درگاه (فاکتور از نوع `WALLET_TOPUP`) — بعد از تایید پرداخت، موجودی خودکار اضافه می‌شود.
- **خرید پلن و محصول همیشه اول از کیف پول پرداخت می‌شود** — کافی است `POST /api/checkout` با `planId`/`productId` صدا زده شود؛ سرور خودش تصمیم می‌گیرد:
  - موجودی **کافی** → فاکتور ساخته و همان لحظه از کیف پول پرداخت‌شده ثبت می‌شود و اشتراک تحویل داده می‌شود (بدون درگاه).
  - موجودی **ناقص** → مقدار موجود روی فاکتور **رزرو** می‌شود (`Invoice.walletApplied`) و درگاه فقط **مبلغ باقی‌مانده** را دریافت می‌کند.
  - موجودی **صفر** → پرداخت کامل با درگاه.
  - اگر provider موقتاً شکست بخورد، settlement مالی دوباره اجرا نمی‌شود؛ fulfillment با lease/backoff قابل retry می‌ماند. رزرو محصول در مسیرهای شکست/انقضا/ابطال طبق state machine آزاد می‌شود.
- `payWith: 'wallet'` حالت سخت‌گیرانه است (فقط کیف پول): اگر موجودی کافی نباشد با کد `INSUFFICIENT_FUNDS` رد می‌شود.
- ادمین از صفحه مشتری می‌تواند کیف پول را شارژ/برداشت کند (`ADMIN_CREDIT` / `ADMIN_DEBIT`).
- منطق authoritative کیف پول در `src/modules/wallet/server/wallet.ts` است؛ `src/lib/wallet.ts` فقط compatibility re-export قدیمی است.

## مدیریت کامل مشتری (Customer 360)

از **پنل ادمین → مشتریان → روی هر کاربر کلیک کن** یک صفحه واحد شامل:

| بخش | کارها |
|---|---|
| نمای کلی | تغییر وضعیت (فعال/مسدود)، نقش و دسترسی، یادداشت CRM |
| کیف پول | شارژ/برداشت دستی با توضیح، مشاهده دفتر تراکنش‌ها |
| اشتراک‌ها | فعال/غیرفعال، چرخش لینک، صفرکردن ترافیک، پاک‌سازی دستگاه‌ها، همگام‌سازی، تمدید |
| صورت‌حساب | **تغییر دستی وضعیت فاکتور**: پرداخت‌شده / پرداخت‌نشده / ابطال / استرداد، به‌همراه سفارش‌ها |
| CRM | یادداشت‌ها و تیکت‌های همان کاربر |

همین عملیات اشتراک از مسیر مشترک `src/modules/subscriptions/server/submanage.ts` اجرا می‌شود؛ `src/lib/submanage.ts` فقط compatibility re-export است. بنابراین پنل ادمین، پنل مشتری و API عمومی **رفتار یکسان** دارند.

## API عمومی کاربر (`/api/v1`)

احراز هویت با کلید API: `Authorization: Bearer kv_...` یا هدر `X-API-Key`. (پارامتر `?api_key=` پذیرفته **نمی‌شود** تا کلید در لاگ‌ها ثبت نشود.) کلیدها فقط به‌صورت هش SHA-256 ذخیره می‌شوند و کاربر آن‌ها را از **پنل → دسترسی API** می‌سازد. محدودیت پیش‌فرض: ۱۲۰ درخواست در دقیقه برای هر کلید.

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/v1/me` | پروفایل، موجودی کیف پول و شمارش‌ها |
| GET | `/api/v1/subscriptions` | لیست اشتراک‌ها + لینک اشتراک + ترافیک/انقضا |
| GET | `/api/v1/subscriptions/{id}/{action}` | `devices` ، `sync` |
| POST | `/api/v1/subscriptions/{id}/{action}` | `enable` ، `disable` ، `rotate` ، `renew` ، `reset-traffic` ، `reset-devices` ، `delete-device` (با `hwid`) |
| DELETE | `/api/v1/subscriptions/{id}/devices?hwid=...` | حذف دستگاه |
| GET | `/api/v1/wallet` | موجودی و تراکنش‌ها |
| POST | `/api/v1/wallet` | `{ "amount": 25 }` → لینک پرداخت شارژ کیف پول |

پاسخ‌ها در قالب یکنواخت `{ ok: true, data }` یا `{ ok: false, error }` برمی‌گردند.

## ادیتور محتوا

ادیتور غنی مشترک (`src/components/RichEditor.tsx`) بر پایه Tiptap v3 و در پست‌ها، صفحات CMS و تیکت‌ها استفاده می‌شود:
سرتیتر، لیست، **لیست وظایف**، نقل‌قول، بلوک/کد درون‌خطی، تراز متن، لینک، تصویر (URL یا آپلود از دستگاه)، ویرایش سورس HTML، حالت تمام‌صفحه.
خروجی HTML است و سمت سرور با `cleanRichText` / `sanitizeMessage` در `src/shared/content/sanitize.ts` پاک‌سازی می‌شود.

## تایپوگرافی و سئو

- فونت‌ها با `next/font/google` بارگذاری و **self-host** می‌شوند: **Vazirmatn** برای فارسی و **Inter** برای لاتین (`--font-vazir` / `--font-inter`). نیاز به اینترنت فقط هنگام `npm run build` است.
- متادیتا، canonical، hreflang و Open Graph در `src/modules/site/server/seo.ts`؛ JSON-LD برای Organization/WebSite، FAQ، مقاله، محصول و Breadcrumb.
- `sitemap.xml` و `robots.txt` داینامیک (`src/app/sitemap.ts`, `src/app/robots.ts`).

## مینی‌اپ تلگرام

مینی‌اپ در `/miniapp` یک پوسته‌ی مستقل با نوار تب پایین است و **کاملاً با تم سایت همگام است**:

- هیچ رنگ hardcode ندارد؛ همه‌ی رنگ‌ها/رادیوس‌ها از توکن‌های سایت (`--bg`، `--bg-soft`، `--card`، `--border`، `--text`، `--muted`، `--primary`، `--primary-soft`، `--on-primary`، `--hp-radius`) می‌آیند؛ بنابراین تم انتخابی ادمین (Studio/Theme)، حالت روشن/تاریک و `--site-*` خودکار اعمال می‌شوند.
- مارک و نام برند دقیقاً همان مارک هدر سایت است (`brand-mark` با گلیف `H`).
- کروم خود تلگرام (هدر، پس‌زمینه و نوار پایین) با `setHeaderColor` / `setBackgroundColor` / `setBottomBarColor` از همان توکن‌ها رنگ می‌شود و روی رویداد `themeChanged` تلگرام دوباره اعمال می‌گردد (`src/app/miniapp/telegram-client.ts`).

## تکنولوژی

Next.js 15 (App Router) · React 19 · TypeScript · Prisma + PostgreSQL (production) / SQLite (development) · NextAuth · CSS سفارشی RTL بدون Tailwind · Tiptap v3 · Vazirmatn + Inter

## نکات امنیتی

### Cloudflare Turnstile برای ورود و ثبت‌نام

در Cloudflare یک Turnstile widget برای دامنهٔ سایت بسازید و این سه مقدار را در
محیط production قرار دهید:

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
TURNSTILE_EXPECTED_HOSTNAME=example.com
```

توکن در سرور با Siteverify، IP کاربر، action و hostname بررسی می‌شود. اگر کلیدها
تنظیم نشده باشند Turnstile غیرفعال می‌ماند؛ هر دو کلید باید هم‌زمان تنظیم شوند.

- رمز ادمین پیش‌فرض را عوض کنید و `NEXTAUTH_SECRET` تصادفی بسازید
- پنل را پشت HTTPS قرار دهید
- در Plisio حتماً IP سرور را به‌عنوان Request IP ثبت کنید

### کنترل‌های امنیتی اعمال‌شده در این نسخه

| کنترل | جزئیات |
| --- | --- |
| هدرهای امنیتی سراسری | `middleware.ts` هدرهای CSP، `X-Frame-Options`، `X-Content-Type-Options`، `Referrer-Policy`، `Permissions-Policy` و (در production) `HSTS` را روی همه مسیرها می‌گذارد. مسیر `/miniapp` عمداً برای فریم تلگرام باز است. |
| محافظت CSRF/Origin | درخواست‌های تغییردهنده (`POST/PUT/PATCH/DELETE`) روی `/api/*` فقط با Origin هم‌سایت (`NEXTAUTH_URL` یا دامنه درخواست) پذیرفته می‌شوند. مسیرهای وب‌هوک/سرور-به-سرور مستثنا هستند و با امضا/secret احراز می‌شوند. |
| Rate limiting ورود و ثبت‌نام | ۳۰ تلاش در ۱۰ دقیقه برای هر IP و ۸ تلاش برای هر IP+ایمیل در لاگین؛ ۵ ثبت‌نام در ساعت برای هر IP. |
| سیاست رمز | حداقل ۸ و حداکثر ۱۲۸ کاراکتر در ثبت‌نام و تغییر رمز. |
| Rate limiting فرم‌ها و API عمومی | فرم‌های سایت ۵ ارسال در دقیقه برای هر IP؛ API عمومی ۱۲۰ درخواست در دقیقه برای هر کلید؛ `/api/happ/sub/*` ۲۰ درخواست در دقیقه. |
| کلیدهای API | فقط به‌صورت هش SHA-256 ذخیره می‌شوند، پارامتر `?api_key=` پذیرفته نمی‌شود و کلیدهای قدیمی در اولین استفاده به‌صورت خودکار migrate می‌شوند. |
| ضد SSRF | آدرس‌های loopback/خصوصی/متادیتای ابری در واکشی کانفیگ از پنل بلاک می‌شوند. |
| throttle سینک اشتراک | تنها رکوردهای قدیمی‌تر از ۵ دقیقه (حداکثر ۱۰ مورد در هر درخواست) با پنل sync می‌شوند تا پنل VPN هدف DoS قرار نگیرد. |
| پیام‌های خطا | خطاهای داخلی پنل/درگاه به کلاینت برنمی‌گردند و فقط در لاگ سرور ثبت می‌شوند. |
| امضای وب‌هوک | مقایسه‌ی `verify_hash` با `crypto.timingSafeEqual` انجام می‌شود. |
| SQLite | `PRAGMA journal_mode=WAL` و `busy_timeout=5000` هنگام اتصال فعال می‌شوند. |
