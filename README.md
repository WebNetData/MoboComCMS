# MoboComCMS

**موبوکام** یک پلتفرم فارسی مدیریت محتوا، جامعهٔ کاربری، فروشگاه و ارتباط با مشتری است. بخش‌های سایت روی یک هستهٔ مشترک کار می‌کنند: هویت و دسترسی کاربران، رسانه، جست‌وجو، اعلان‌ها، تنظیمات، صف کارها و ثبت رویدادهای مدیریتی.

## امکانات اصلی

| بخش | امکانات |
| --- | --- |
| مجله و صفحات | مدیریت مقاله و صفحه، ویرایشگر بلوکی، دسته‌بندی و نسخه‌های ویرایش |
| موزیک | آهنگ، هنرمند، آلبوم، پلی‌لیست و کتابخانهٔ شخصی |
| سینما | فیلم، سریال، فصل و قسمت، عوامل و فایل‌های پخش |
| بازی و نرم‌افزار | محتوای تخصصی، فایل‌های دانلود و دسته‌بندی |
| انجمن و جامعه | ساختار انجمن، بحث و پاسخ، دنبال‌کردن و مدیریت محتوا |
| فروشگاه | محصول و گونه، سبد خرید، سفارش، پرداخت، تحویل، کیف پول و مرجوعی |
| مدیریت و CRM | کاربران، مدیران بخش‌ها، مشتریان، دسترسی‌ها، آمار و رویدادهای مدیریتی |
| توسعه‌پذیری | ماژول، افزونه، قالب، تنظیمات مستقل و مخزن بسته‌ها |

رابط فارسی و RTL، ظاهر روشن و تیره و نمایش موبایل در پروژه وجود دارند. ماژول‌های اختیاری از پنل مدیریت قابل تنظیم‌اند؛ خاموش‌کردن یک بخش به معنی حذف داده‌های آن نیست. اتصال‌های قدیمی VPN و نمایندگی اختیاری‌اند و پیش‌نیاز سایت محتوایی نیستند.

## فناوری و ساختار

- Next.js 15 و React 19؛ TypeScript و Prisma.
- PostgreSQL 17 برای محیط تولید؛ Redis برای کش، رویدادها و محدودیت درخواست مشترک.
- Node.js 22 در Dockerfile پروژه؛ معماری modular monolith با مالک مشخص برای هر بخش.
- Playwright، تست‌های متصل PostgreSQL/Redis و گیت‌های معماری، امنیت و سازگاری schema.

```text
src/app/          صفحات و مسیرهای برنامه
src/modules/      بخش‌های تخصصی و منطق کسب‌وکار
src/platform/     سرویس‌های مشترک پلتفرم
src/plugins/      افزونه‌ها و تعریف ماژول‌ها
src/themes/       قالب‌ها و ابزار توسعهٔ ظاهر
prisma/           schema، مهاجرت‌ها و seed
public/           فایل‌های عمومی
scripts/          ابزارهای تست، نگهداری و انتشار
deploy/           پیکربندی استقرار و سرویس‌ها
docs/             راهنماهای نصب، توسعه و معماری
docs/releases/    آرشیو یادداشت‌های نسخه‌های قدیمی
```

## نصب روی سرور

### ۱. دریافت پروژه

```bash
git clone https://github.com/WebNetData/MoboComCMS.git
cd MoboComCMS
```

### ۲. استقرار با Docker یا Coolify

برای نصب با Coolify، مخزن را به‌عنوان برنامهٔ **Dockerfile** اضافه کنید. PostgreSQL 17 و Redis را به‌صورت سرویس‌های خصوصی بسازید و نشانی داخلی آن‌ها را در تنظیمات برنامه قرار دهید.

| تنظیم | مقدار |
| --- | --- |
| فایل ساخت | `Dockerfile` |
| پورت داخلی برنامه | `3000` |
| بررسی سلامت | `/api/health/ready` |
| دامنه | دامنهٔ واقعی با HTTPS |
| فضای دائمی برنامه | `/app/storage` و `/app/var`؛ قابل نوشتن توسط کاربر `node` |
| پایگاه داده | فضای دائمی مستقل برای PostgreSQL |

Dockerfile گیت‌های پروژه و build را اجرا می‌کند. شروع برنامه شامل بررسی تنظیمات و اجرای مهاجرت‌های ثبت‌شده است. در استقرار Docker مستقل، ابتدا تصویر را بسازید:

```bash
docker build -t mobocomcms:local .
```

سپس آن را با شبکهٔ خصوصی دیتابیس و Redis، تنظیمات زیر و volumeهای دائمی اجرا کنید. آموزش تنظیم سرور و پراکسی: [Docker/Coolify](docs/DEPLOY-COOLIFY.md) و [VPS یا هاست Node.js](docs/DEPLOY-VPS-HOST-FA.md).

### ۳. تنظیمات ضروری

نمونهٔ تنظیمات: [.env.production.example](.env.production.example). مقادیر واقعی را در secret/environment سرور وارد کنید و داخل Git قرار ندهید.

```dotenv
NODE_ENV=production
NEXTAUTH_URL=https://your-domain.example
DATABASE_URL=postgresql://USER:PASSWORD@POSTGRES_HOST:5432/DATABASE
REDIS_URL=redis://REDIS_HOST:6379
NEXTAUTH_SECRET="" # Fill with an independent openssl rand -hex 32 value
INTERNAL_JOBS_SECRET="" # Fill with an independent openssl rand -hex 32 value
PANEL_CREDENTIAL_KEY="" # Fill with an independent openssl rand -hex 32 value
BACKUP_ENCRYPTION_KEY="" # Fill with an independent openssl rand -hex 32 value
SEED_DEMO_DATA=false
BACKUP_SCHEDULER=false
RUN_MIGRATIONS_ON_START=true
INTERNAL_APP_ORIGIN=http://127.0.0.1:3000
```

نشانی و رمز دیتابیس و Redis را از سرویس‌های خودتان بگیرید. برای **هر کلید مستقل** دستور زیر را یک بار اجرا کنید و خروجی متفاوت آن را استفاده کنید:

```bash
openssl rand -hex 32
```

`PANEL_CREDENTIAL_KEY` و `BACKUP_ENCRYPTION_KEY` را در محل امن جداگانه نگه دارید؛ تغییر یا گم‌کردن آن‌ها می‌تواند خواندن داده‌های رمزگذاری‌شده یا بکاپ را ناممکن کند. زمان‌بند بکاپ را پس از تنظیم مقصد و آزمون بازیابی فعال کنید. تنظیمات درگاه، ایمیل، پیامک و سرویس‌های اختیاری فقط برای قابلیت‌های فعال لازم‌اند.

### ۴. نصب اولیه و حساب مدیر

روی **دیتابیس تازه**، `/install` را باز کنید و مراحل نام سایت، دامنه، اولین مدیر و امکانات فعال را انجام دهید. کد خصوصی نصب از خروجی اولین راه‌اندازی در دسترس است؛ می‌توانید `INSTALL_TOKEN` تصادفی با حداقل ۳۲ نویسه را خودتان تنظیم کنید. در production بدون کد امن، نصب باز نمی‌شود. پس از ساخت اولین مدیر، نصب‌کننده بسته می‌شود؛ `INSTALL_DISABLED=true` نیز آن را غیرفعال می‌کند.

اگر نصب را از ترمینال انجام می‌دهید، در محیط برنامه و فقط برای نصب اولیه:

```bash
npm run deploy:migrate
ADMIN_EMAIL='admin@your-domain.example' ADMIN_PASSWORD='YOUR_STRONG_PASSWORD' SEED_DEMO_DATA=false npm run deploy:seed
```

سپس وارد `/admin` شوید و نام سایت، مدیران بخش‌ها، ماژول‌های فعال و سرویس‌های موردنیاز را تنظیم کنید. seed را هنگام آپدیت معمولی تکرار نکنید. برای نصب بدون دیتابیسِ پیکربندی‌شده، توضیحات نصب‌کننده در [راهنمای VPS](docs/DEPLOY-VPS-HOST-FA.md) را بخوانید.

راهنمای [نصب تحت وب و پنل سرور](docs/WEB_SETUP_AND_SERVER.md) مراحل اتصال PostgreSQL، کد نصب، مدیریت جداول و بکاپ دستی، صدور SSL با HTTP/DNS/Standalone، بارگذاری گواهی و به‌روزرسانی امن را توضیح می‌دهد. آماده‌سازی سرویس‌ها و HTTPS اولیه باید پیش از نصب وب انجام شود.

برای انتقال محتوا، [راهنمای ورود گروهی و نمونه‌فایل‌ها](docs/BULK_IMPORT.md) را بخوانید؛ همین راهنما از تب «راهنما و نمونه‌فایل» در `/admin/imports` هم در دسترس است. ابتدا چند رکورد پیش‌نویس وارد کنید و سپس انتقال فایل و گزارش را بررسی کنید.

### ۵. بررسی پس از نصب

```bash
curl --fail https://your-domain.example/api/health/ready
```

ورود مدیر، ذخیره و بازکردن یک محتوا، آپلود فایل و مسیرهای فعال سایت را در مرورگر بررسی کنید. قبل از فروش واقعی، پرداخت و تحویل را با سرویس پیکربندی‌شدهٔ خودتان آزمایش کنید. کارهای زمان‌بندی‌شده، HTTPS و بکاپ را طبق [چک‌لیست انتشار](docs/RELEASE-CHECKLIST.md) تنظیم کنید.

## اجرای محلی برای توسعه

Docker Desktop یا Docker Engine و Compose را اجرا کنید، سپس:

```bash
cp .env.example .env
```

در `.env`، نشانی محلی سایت را `http://localhost:3000` و اتصال دیتابیس **داخل کانتینر** را مانند زیر تنظیم کنید. کلیدهای لازم و حساب مدیر اولیه را هم وارد کنید:

```dotenv
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://mobocom:mobocom-local@postgres:5432/mobocom?schema=public
SEED_DEMO_DATA=false
```

```bash
docker compose -f docker-compose.local.yml up --build -d
```

سایت: `http://localhost:3000`؛ مدیریت: `/admin`. برای ابزارهایی که روی خود کامپیوتر اجرا می‌شوند، PostgreSQL روی `127.0.0.1:5435` در دسترس است. پس از تغییر کد، کانتینر برنامه را restart کنید یا از حالت watch همان Compose استفاده کنید. این تنظیمات و رمزهای محلی برای production نیستند.

## تست و بررسی تغییرات

```bash
npm ci
npm run check
npm run build:postgres
npm run test:pg
npm run test:redis
```

`test:pg` به دیتابیس تستی PostgreSQL و `test:redis` به Redis تستی نیاز دارند. آن‌ها را روی دیتابیس واقعی اجرا نکنید. بخشی از تست‌های ابزارهای استقرار به Linux نیاز دارند. تست مرورگر با `npm run test:e2e` اجرا می‌شود؛ جزئیات fixture و CI در [چک‌لیست انتشار](docs/RELEASE-CHECKLIST.md) است.

## آپدیت و نگهداری داده

قبل از آپدیت، از PostgreSQL، فایل‌های `storage/` و کلیدهای رمزگذاری بکاپ قابل‌بازیابی داشته باشید. مهاجرت تولید با `npm run deploy:migrate` انجام می‌شود؛ از `prisma db push` برای دیتابیس واقعی استفاده نکنید. کد، دیتابیس و فایل‌های کاربران جدا نگهداری می‌شوند.

- [بکاپ و بازیابی](docs/POSTGRESQL-BACKUPS.md)
- [آپدیت و نگهداری داده](docs/UPDATES-AND-DATA.md)
- [آخرین یادداشت‌های انتشار](RELEASE-NOTES.md)
- [آرشیو نسخه‌های قدیمی](docs/releases/README.md)

## مستندات توسعه

- [راهنمای ساخت افزونه، قالب و ماژول](docs/DEVELOPERS-FA.md)
- [Site Studio](docs/SITE-STUDIO.md)
- [معماری و قراردادهای پلتفرم](docs/agent/ARCHITECTURE.md)
- [وضعیت قابلیت‌ها](docs/agent/CAPABILITY_LEDGER.md)
- [مسیر کار و ابزارهای مهندسی](AGENTS.md)

وجود یک قابلیت در کد به معنی پیکربندی سرویس بیرونی یا تأیید استقرار روی سرور شما نیست؛ تنظیمات و مسیرهای فعال را پس از نصب بررسی کنید.
