# راهنمای سریع نصب MoboComCMS روی Coolify

این نسخه برای این طراحی شده که کد برنامه قابل تعویض باشد ولی اطلاعات کاربران،
سفارش‌ها، اشتراک‌ها و فایل‌های آپلودشده با هر آپدیت باقی بمانند.

## معماری پیشنهادی

- Ubuntu 24.04 LTS
- Coolify روی همان VPS
- MoboComCMS در یک Application کانتینری
- PostgreSQL به‌صورت Resource جدا با Volume دائمی
- `/app/storage` به‌صورت Persistent Storage
- کد در Git خصوصی
- secretها فقط در Environment Variables خود Coolify

برای شروع عملی 4 vCPU، 8 GB RAM و حداقل 80 GB NVMe انتخاب مناسبی است.

## 1) نصب Coolify

روی سرور تازه و بعد از اطمینان از دسترسی SSH:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

بلافاصله حساب Admin کولـیفای را بساز و فایل secretهای خود Coolify را هم بکاپ
کن. بعد از تنظیم دامنه Coolify، دسترسی مستقیم عمومی پورت‌های مدیریتی را ببند.

## 2) PostgreSQL

در Coolify یک PostgreSQL جدا بساز. دیتابیس را public نکن. Internal URL را به
عنوان `DATABASE_URL` برنامه استفاده کن.

مهم: در production هیچ‌وقت `prisma db push` نزن. آپدیت‌ها فقط با migrationهای
commitشده و `prisma migrate deploy` انجام می‌شوند.

## 3) Application

Repository خصوصی پروژه را به Coolify وصل کن:

- Build Pack: Dockerfile
- Port: `3000`
- Health Check: `/api/health/ready`
- Replica: ابتدا `1`
- Persistent Storage destination: `/app/storage`

Dockerfile قبل از ساخت image، release checks و build PostgreSQL را اجرا می‌کند.
اگر check یا build خراب باشد release ساخته نمی‌شود.

## 4) Environment ضروری

این secretها را مستقل بساز:

```bash
openssl rand -hex 32   # NEXTAUTH_SECRET
openssl rand -hex 32   # INTERNAL_JOBS_SECRET
openssl rand -hex 32   # PANEL_CREDENTIAL_KEY
```

نمونه اصلی در `.env.production.example` است. مهم‌ترین‌ها:

```env
NODE_ENV=production
NEXTAUTH_URL=https://YOUR_DOMAIN
NEXTAUTH_SECRET=...
DATABASE_URL=postgresql://...
INTERNAL_JOBS_SECRET=...
PANEL_CREDENTIAL_KEY=...
RUN_MIGRATIONS_ON_START=true
INTERNAL_APP_ORIGIN=http://127.0.0.1:3000
ALLOW_LEGACY_HAPP_PROXY=false
```

`PANEL_CREDENTIAL_KEY` را بعداً بی‌دلیل عوض نکن. token/password پنل‌های VPN با
همین کلید در DB رمز می‌شوند. یک نسخه امن خارج از سرور از این کلید نگه دار.

## 5) اولین Deploy

Startup کانتینر به ترتیب:

1. env production را validate می‌کند.
2. migrationهای PostgreSQL را اجرا می‌کند.
3. credential قدیمی پنل‌ها را در صورت plaintext بودن رمز می‌کند.
4. برنامه را اجرا می‌کند.

بعد از Healthy شدن، فقط بار اول از Terminal برنامه:

```bash
ADMIN_EMAIL='you@example.com' \
ADMIN_PASSWORD='A-VERY-STRONG-PASSWORD' \
SEED_DEMO_DATA=false \
npm run deploy:seed
```

Seed را در آپدیت‌های عادی اجرا نکن.

## 6) Scheduled Tasks

Fulfillment و reconciliation هر دقیقه:

```text
* * * * *
node scripts/run-internal-job.cjs fulfillment
```

Reminder هر پنج دقیقه:

```text
*/5 * * * *
node scripts/run-internal-job.cjs reminders
```

## 7) بکاپی که واقعاً قابل بازیابی باشد

چهار چیز را مستقل نگه دار:

1. Git repository پروژه
2. بکاپ PostgreSQL خارج از همان VPS
3. بکاپ `/app/storage`
4. secret inventory خصوصاً `PANEL_CREDENTIAL_KEY`

Volume دائمی بکاپ محسوب نمی‌شود. هر چند وقت یک‌بار restore را روی دیتابیس تستی
واقعاً امتحان کن.

## 8) روش آپدیت بدون از دست‌رفتن اطلاعات

برای هر نسخه:

1. بکاپ جدید PostgreSQL را تأیید کن.
2. تغییرات را ابتدا روی staging تست کن.
3. اگر schema عوض شده migration جدید بساز؛ migration قبلی را ویرایش نکن.
4. کد + migration را commit و push کن.
5. Coolify image جدید می‌سازد و migration را قبل از start اجرا می‌کند.
6. `/api/health/ready` و یک خرید تستی را بررسی کن.

کد داخل container عوض می‌شود؛ PostgreSQL و `/app/storage` و Environment Variables
عوض نمی‌شوند. بنابراین آپدیت سورس نباید اطلاعات مشتری را حذف کند.

## 9) اضافه‌کردن VPN Panel جدید

منطق اصلی خرید و subscription نباید provider-specific شود. پنل جدید از
`PanelAdapter` اضافه می‌شود. `Panel.type` رشته‌ای و `Panel.config` JSON عمومی
(non-secret) است، بنابراین در حالت معمول اضافه‌کردن provider جدید نیازی به
تغییر جداول User/Order/Subscription ندارد.

راهنمای کامل: `docs/ADDING-VPN-PANEL.md`

## آمادگی برای ترافیک بالا (Redis، CDN، پایش و آزمون بار)

### Redis (کش مشترک و محدودیت درخواست بین چند سرور)
بدون Redis همه‌چیز روی حافظهٔ همان برنامه کار می‌کند (برای یک سرور کافی است). برای اجرای چند نسخه از برنامه (چند سرور یا PM2 در حالت cluster):

```bash
sudo apt install redis-server
# در .env
REDIS_URL=redis://127.0.0.1:6379
REDIS_PREFIX=mobo:          # اختیاری؛ اگر چند سایت روی یک Redis هستند
```
تنظیمات سایت، شمارنده‌های محدودیت درخواست و کش‌ها بین همهٔ نسخه‌ها مشترک می‌شوند. اگر Redis در دسترس نباشد، سایت روی حافظهٔ داخلی ادامه می‌دهد و صفحهٔ «پایش سرعت و سلامت سرور» هشدار می‌دهد.

### پایگاه داده
برای ترافیک بالا از PostgreSQL استفاده کنید (`npm run build:postgres` و `DATABASE_URL=postgresql://…`). کارهای سنگین (بهینه‌سازی تصاویر، بازسازی جست‌وجو) در صف پس‌زمینه اجرا می‌شوند و درخواست کاربران را کند نمی‌کنند.

### CDN
- ساده‌ترین روش: دامنه را پشت Cloudflare (حالت Proxied) بگذارید. فایل‌های `/_next/static`، فونت‌ها و تصاویر با هدر کش بلندمدت سرو می‌شوند. دکمهٔ «پاک‌کردن کش کلادفلر» در صفحهٔ پایش هست (توکن کلادفلر از پنل سرور ← دامنه‌ها).
- CDN جدا برای فایل‌های برنامه: `CDN_URL=https://cdn.example.com` (پیش از build).
- CDN جدا برای تصاویر: `NEXT_PUBLIC_MEDIA_CDN=https://media.example.com` که مبدأ آن همین سایت است (پیش از build).

### پایش
مدیریت ← «پایش سرعت و سلامت سرور»: پردازنده، حافظه، دیسک، تأخیر پایگاه داده و Redis، صف کارها، زمان‌بند، خطاهای اخیر، کوئری‌های کند (بیش از `SLOW_QUERY_MS`، پیش‌فرض ۳۰۰) و سرعت واقعی کاربران (Web Vitals از ۲۰٪ بازدیدها).

### گفت‌وگوی زنده (SSE)

پیام‌های چت با اتصال زنده (Server-Sent Events) روی `/api/chat/stream` و `/api/admin/chat/stream` می‌رسند. با `REDIS_URL` رویدادها بین همهٔ نمونه‌های برنامه پخش می‌شوند؛ بدون Redis فقط روی همان یک سرور کار می‌کند. در nginx برای این مسیرها بافر را خاموش کنید (هدر `X-Accel-Buffering: no` هم فرستاده می‌شود):

```nginx
location ~ ^/api/(admin/)?chat/stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

اگر اتصال زنده برقرار نشود، ویجت و پنل اپراتور خودکار به روش دوره‌ای (هر چند ثانیه) برمی‌گردند.

### نرخ ارز و قیمت ارزی

از «فروشگاه ← نرخ ارز» منبع نرخ را انتخاب کنید (نوسان، BrsApi یا هر API با خروجی JSON) و کلید API را وارد کنید. نرخ‌ها طبق بازهٔ تنظیم‌شده با زمان‌بند داخلی به‌روز می‌شوند و قیمت محصولات ارزی (قیمت ارزی × نرخ + درصد سود + سود ثابت) خودکار دوباره حساب می‌شود. جهش بیش از حد مجاز تا تأیید مدیر اعمال نمی‌شود. سرور باید به `api.navasan.tech` / `brsapi.ir` و برای نرخ‌های جهانی به `open.er-api.com` دسترسی خروجی داشته باشد.

### آزمون بار
از یک سیستم دیگر (نه خود سرور) اجرا کنید:

```bash
node scripts/load-test.mjs https://example.com --users 50 --seconds 60 --paths /,/products,/blog
```
گزارش: تعداد درخواست در ثانیه، صدک‌های ۵۰/۹۵/۹۹ زمان پاسخ و خطاها برای هر مسیر. اگر بیش از ۱٪ خطا باشد، خروجی با کد ۲ پایان می‌یابد. هم‌زمان صفحهٔ پایش را باز نگه دارید تا گلوگاه (پردازنده، پایگاه داده یا کوئری کند) مشخص شود.
