# بستهٔ Deploy MoboComCMS

این سورس برای production با **Docker + PostgreSQL + Coolify** آماده شده است. راهنمای اصلی نصب:

- `docs/DEPLOY-COOLIFY.md`
- `docs/UPDATES-AND-DATA.md`
- `docs/ADDING-VPN-PANEL.md`

دادهٔ واقعی داخل سورس نگهداری نمی‌شود. کاربران، سفارش‌ها، اشتراک‌ها و تنظیمات در PostgreSQL؛ آپلودها در `/app/storage` persistent؛ و secretها در Environment Variables پنل سرور قرار می‌گیرند. بنابراین redeploy سورس نباید داده را پاک کند.

برای production از `prisma migrate deploy` استفاده کنید و **هیچ‌وقت `prisma db push` را روی دیتابیس واقعی اجرا نکنید**. Seed فقط بار اول روی دیتابیس خالی انجام می‌شود.

Dockerfile هنگام build همه release gateها و build PostgreSQL را اجرا می‌کند و در runtime قبل از بالا آمدن برنامه env preflight و migrationهای pending را اعمال می‌کند.


## راه‌اندازی درگاه پرداخت ارزی ریالی (FrenzyEx)

1. در ادمین یک Gateway با provider برابر `FRENZYEX` بسازید و API Key و Callback Secret را فقط سمت سرور ذخیره کنید، یا از متغیرهای `FRENZYEX_API_KEY` و `FRENZYEX_CALLBACK_SECRET` استفاده کنید.
2. Callback عمومی HTTPS را در پنل درگاه روی `https://YOUR_DOMAIN/api/payment/frenzyex/webhook` تنظیم کنید.
3. `usdRateToman` را در تنظیمات ادمین (یا `FRENZYEX_USD_RATE_TOMAN`) تعیین کنید اگر قیمت محصولات USD است.
4. `INTERNAL_JOBS_SECRET` را با مقدار تصادفی قوی تنظیم کنید و `POST /api/internal/fulfillment/run?limit=50` را تقریباً هر یک دقیقه اجرا کنید. این worker ابتدا پرداخت‌های FrenzyEx را reconcile می‌کند، بعد fulfillment را retry و reservationهای منقضی را پاک می‌کند.
5. قبل از فروش واقعی، callback test، یک پرداخت کم‌مبلغ، resend همان callback و بازیابی یک callback دیررس با worker را تست کنید. جزئیات در `docs/FRENZYEX-PRODUCTION.md` است.

---

## اجرای روی PostgreSQL (پیش‌فرض production)

این نسخه روی PostgreSQL اجرا و rehearse شده است:

1. دیتابیس را بالا بیاورید: `docker compose --env-file deploy/.env.postgres -f deploy/compose.postgres.yml up -d --wait` (پورت 127.0.0.1:5434؛ رمز در `deploy/.env.postgres` — آن را commit نکنید).
2. در `.env` مقدار `DATABASE_URL=postgresql://happvpn:<رمز>@127.0.0.1:5434/happvpn?schema=public` را قرار دهید.
3. `npm run db:migrate:postgres` برای اعمال مهاجرت baseline.
4. انتقال داده‌ی SQLite (اختیاری): وقتی کلاینت SQLite هنوز generate شده `npm run db:export:sqlite`، سپس `npm run db:generate:postgres` و `npm run db:import:postgres` — ایمپورتر تعداد ردیف‌ها و digest‌ها را تأیید می‌کند.
5. `npm ci && npm run check && npm run build && npm start` (تولید کلاینت از DATABASE_URL تشخیص داده می‌شود).

### بکاپ و بازیابی

- پنل: `/admin/telegram` → کارت «بکاپ PostgreSQL»: فعال‌سازی بکاپ خودکار هر ۲ ساعت، ارسال فایل رمزگذاری‌شده فقط به شناسه عددی تلگرام ادمین، بکاپ دستی، آزمون بازیابی و بازیابی واقعی با تأیید تایپی.
- سرور به `BACKUP_ENCRYPTION_KEY` (۶۴ کاراکتر hex) نیاز دارد؛ بدون آن بکاپ‌ها قابل بازیابی نیستند.
- جزئیات کامل و بازیابی از تلگرام: `docs/POSTGRESQL-BACKUPS.md`.


## Production secret you must preserve

Generate `PANEL_CREDENTIAL_KEY` exactly once (`openssl rand -hex 32`) and store
it in Coolify plus a secure offline recovery record. VPN-panel tokens/passwords
are AES-256-GCM encrypted with this key. Normal source updates do not touch the
key or database.
