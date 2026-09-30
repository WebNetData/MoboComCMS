# راهنمای قدم‌به‌قدم اجرای موبوکام روی سرور مجازی (VPS) و هاست

این راهنما دو مسیر دارد:

- **بخش الف — سرور مجازی (VPS) اوبونتو:** مسیر پیشنهادی و کامل. همهٔ امکانات (از جمله ورود گروهی اطلاعات، کارهای پس‌زمینه، پشتیبان‌گیری خودکار، به‌روزرسانی یک‌کلیکی و پنل سرور) کار می‌کنند.
- **بخش ب — هاست (cPanel یا DirectAdmin با «Node.js App»):** برای وقتی که سرور مجازی ندارید. محدودیت‌هایش در همان بخش آمده است.

در پایان، **بخش ج** مخصوص سیستم «ورود گروهی اطلاعات» (Bulk Import) است و برای هر دو مسیر یکسان است.

> هر جا `example.com` آمده، دامنهٔ خودتان را بگذارید. موبوکام در حالت production فقط با **PostgreSQL** اجرا می‌شود (بررسی راه‌اندازی، SQLite را در production نمی‌پذیرد).

---

## بخش الف — سرور مجازی (Ubuntu 22.04 / 24.04)

راهنمای تفصیلی همین مسیر در `docs/DEPLOY-UBUNTU.md` است؛ این‌جا ترتیب کارها به‌صورت فهرست قدم‌به‌قدم آمده است.

### قدم ۱ — مشخصات سرور

| مورد | حداقل | پیشنهادی |
| --- | --- | --- |
| پردازنده | ۲ هسته | ۴ هسته |
| رم | ۴ گیگ (با swap) | ۸ گیگ |
| دیسک | ۴۰ گیگ SSD | ۸۰ گیگ NVMe |

ساخت برنامه (build) حدود ۳ گیگ رم می‌خواهد. اگر ورود گروهی با تصاویر زیاد دارید، فضای دیسک را بیشتر بگیرید (تصاویر در `storage/covers` ذخیره می‌شوند).

### قدم ۲ — آماده‌سازی سرور

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl ca-certificates gnupg ufw
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable

# swap برای سرور ۴ گیگی
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### قدم ۳ — نصب Node.js 22، PostgreSQL 17، Nginx

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs

sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt -y install postgresql-17

sudo apt -y install nginx certbot python3-certbot-nginx
```

### قدم ۴ — دیتابیس

```bash
DB_PASS=$(openssl rand -hex 24); echo "رمز دیتابیس: $DB_PASS"
sudo -u postgres psql -c "CREATE USER mobocom WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE mobocom OWNER mobocom;"
```

پورت PostgreSQL را در دیواره‌آتش باز نکنید. قدم ۶ را در **همین ترمینال** انجام دهید تا `DB_PASS` در دسترس باشد.

### قدم ۵ — کاربر سیستم و دریافت کد

```bash
sudo useradd --system --create-home --home-dir /opt/mobocom --shell /bin/bash mobocom
sudo -u mobocom git clone https://github.com/WebNetData/MoboComCMS.git /opt/mobocom/app
sudo -u mobocom mkdir -p /opt/mobocom/app/storage /opt/mobocom/app/var
```

مخزن خصوصی است؟ یک Deploy key فقط‌خواندنی (کلید SSH کاربر `mobocom`) در GitHub بسازید و با `git@github.com:WebNetData/MoboComCMS.git` کلون کنید.

### قدم ۶ — تنظیمات (متغیرهای محیطی)

```bash
sudo mkdir -p /etc/mobocom
sudo tee /etc/mobocom/mobocom.env >/dev/null <<EOF
NODE_ENV=production
NEXTAUTH_URL=https://example.com
NEXTAUTH_SECRET=$(openssl rand -hex 32)
INTERNAL_JOBS_SECRET=$(openssl rand -hex 32)
PANEL_CREDENTIAL_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgresql://mobocom:$DB_PASS@127.0.0.1:5432/mobocom?schema=public
RUN_MIGRATIONS_ON_START=true
SITE_LOCALES=fa
SITE_APPEARANCE=light
EOF
sudo chown root:mobocom /etc/mobocom/mobocom.env && sudo chmod 640 /etc/mobocom/mobocom.env
```

- از این فایل، به‌خصوص `PANEL_CREDENTIAL_KEY`، یک نسخه جای امن بیرون از سرور نگه دارید و هرگز عوضش نکنید.
- `IMPORT_ALLOW_LOOPBACK` را **هرگز** در سرور تنظیم نکنید (فقط برای تست محلی است و در production نادیده گرفته می‌شود).

### قدم ۷ — ساخت و اجرای سرویس

```bash
cd /opt/mobocom/app
sudo -u mobocom bash -c 'npm ci --no-audit --no-fund && set -a && . /etc/mobocom/mobocom.env && set +a && NODE_OPTIONS=--max-old-space-size=3072 npm run build:postgres'

sudo cp deploy/ubuntu/mobocom.service /etc/systemd/system/mobocom.service
sudo systemctl daemon-reload && sudo systemctl enable --now mobocom
curl -s http://127.0.0.1:3000/api/health/ready
```

در اولین اجرا مایگریشن‌ها خودکار اعمال می‌شوند (از جمله جدول‌های ورود گروهی و دسترسی `imports.manage` برای نقش مدیر کل).

### قدم ۸ — ساخت مدیر اول (فقط یک بار)

```bash
cd /opt/mobocom/app
sudo -u mobocom bash -c 'set -a && . /etc/mobocom/mobocom.env && set +a && ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="یک-رمز-خیلی-قوی" SEED_DEMO_DATA=false npm run deploy:seed'
```

### قدم ۹ — Nginx و SSL

رکورد A دامنه باید به IP سرور اشاره کند:

```bash
sudo cp deploy/ubuntu/nginx-mobocom.conf /etc/nginx/sites-available/mobocom
sudo sed -i 's/example.com/دامنه‌شما.ir/g' /etc/nginx/sites-available/mobocom
sudo ln -sf /etc/nginx/sites-available/mobocom /etc/nginx/sites-enabled/mobocom
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d دامنه‌شما.ir -d www.دامنه‌شما.ir --redirect
```

`client_max_body_size 25m` در این تنظیم برای ورود گروهی کافی است (فایل در تکه‌های ۸ مگابایتی ارسال می‌شود). با Cloudflare، حالت SSL را **Full (strict)** بگذارید.

### قدم ۱۰ — پشتیبان‌گیری روزانه

```bash
sudo mkdir -p /var/backups/mobocom && sudo chown mobocom:mobocom /var/backups/mobocom
sudo cp deploy/ubuntu/mobocom-backup.service deploy/ubuntu/mobocom-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mobocom-backup.timer
sudo systemctl start mobocom-backup.service   # یک اجرای آزمایشی
```

پوشهٔ `/var/backups/mobocom` را مرتب به جای دیگری هم کپی کنید.

### قدم ۱۱ — کارهای پس‌زمینه

روی VPS **cron لازم نیست**: خود برنامه هر دقیقه صف کارها را اجرا می‌کند (پرداخت‌ها، صف انتشار، یادآوری‌ها، و **برش‌های ورود گروهی**). هر ۵ دقیقه هم ورودی‌هایی که زنجیرهٔ اجرایشان قطع شده (مثلاً با ری‌استارت) دوباره در صف قرار می‌گیرند.

اگر به هر دلیل `BACKGROUND_JOBS=false` گذاشتید، cron زیر را برای کاربر `mobocom` بسازید (`sudo -u mobocom crontab -e`):

```cron
* * * * * cd /opt/mobocom/app && set -a && . /etc/mobocom/mobocom.env && set +a && node scripts/run-internal-job.cjs imports >/dev/null 2>&1
* * * * * cd /opt/mobocom/app && set -a && . /etc/mobocom/mobocom.env && set +a && node scripts/run-internal-job.cjs fulfillment >/dev/null 2>&1
*/15 * * * * cd /opt/mobocom/app && set -a && . /etc/mobocom/mobocom.env && set +a && node scripts/run-internal-job.cjs engage >/dev/null 2>&1
*/5 * * * * cd /opt/mobocom/app && set -a && . /etc/mobocom/mobocom.env && set +a && node scripts/run-internal-job.cjs store-marketing >/dev/null 2>&1
*/10 * * * * cd /opt/mobocom/app && set -a && . /etc/mobocom/mobocom.env && set +a && node scripts/run-internal-job.cjs reminders >/dev/null 2>&1
```

### قدم ۱۲ — به‌روزرسانی

```bash
echo 'mobocom ALL=(root) NOPASSWD: /usr/bin/systemctl restart mobocom' | sudo tee /etc/sudoers.d/mobocom && sudo chmod 440 /etc/sudoers.d/mobocom
sudo -u mobocom bash /opt/mobocom/app/deploy/ubuntu/update.sh
```

اسکریپت کد تازه را می‌گیرد، می‌سازد و سرویس را ری‌استارت می‌کند؛ مایگریشن‌ها هنگام بالا آمدن اعمال می‌شوند.

### قدم ۱۳ — عیب‌یابی

| کار | دستور |
| --- | --- |
| لاگ زنده | `sudo journalctl -u mobocom -f` |
| سلامت برنامه | `curl -s http://127.0.0.1:3000/api/health/ready` |
| وضعیت صف پس‌زمینه | پنل مدیریت ← «پایش و عملیات» (کارهای `imports.run` همان‌جا دیده می‌شوند) |
| خطای Nginx | `sudo tail -f /var/log/nginx/error.log` |

---

## بخش ب — هاست (cPanel / DirectAdmin با «Setup Node.js App»)

### پیش از خرید هاست این‌ها را بپرسید

موبوکام یک برنامهٔ Node.js (Next.js) است، نه PHP. هاست فقط وقتی مناسب است که **همهٔ** این‌ها را داشته باشد:

1. بخش **Setup Node.js App** (Phusion Passenger / CloudLinux) با **Node.js 20 یا 22**.
2. **PostgreSQL** (در cPanel: «PostgreSQL Databases»). هاستی که فقط MySQL دارد مناسب نیست.
3. **ترمینال یا SSH**.
4. **Cron Jobs**.
5. سقف رم هر پروسه دست‌کم **۱ گیگ** (۲ گیگ بهتر) و سقف فایل‌ها (inode) دست‌کم ۲۰۰ هزار — پوشهٔ `node_modules` پرفایل است.

محدودیت‌های هاست نسبت به VPS: «پنل سرور»، «به‌روزرسانی یک‌کلیکی»، پشتیبان خودکار با systemd و صدور SSL دستی در دسترس نیستند؛ SSL را از بخش SSL/TLS هاست (AutoSSL) بگیرید، پشتیبان را با ابزار Backup هاست بسازید و به‌روزرسانی را با آپلود دوباره انجام دهید. هاست معمولاً رم کافی برای **ساخت** برنامه ندارد؛ برای همین برنامه روی کامپیوتر خودتان (یا یک لینوکس دیگر) ساخته و آپلود می‌شود.

### قدم ۱ — ساخت دیتابیس در هاست

در cPanel ← **PostgreSQL Databases**:

1. یک دیتابیس بسازید (مثلاً `user_mobocom`).
2. یک کاربر با رمز قوی بسازید و با **ALL PRIVILEGES** به دیتابیس اضافه کنید.
3. آدرس اتصال را یادداشت کنید:

```
postgresql://user_mobo:رمز@localhost:5432/user_mobocom?schema=public
```

(اگر رمز نویسهٔ خاص مثل `@` یا `#` دارد، آن را URL-encode کنید.)

### قدم ۲ — ساخت برنامه روی یک لینوکس ۶۴ بیتی

برنامه باید روی **Linux x64** ساخته شود (بسته‌های `sharp` و Prisma فایل اجرایی مخصوص سیستم‌عامل دارند؛ ساخت روی ویندوز یا مک روی هاست کار نمی‌کند). روی ویندوز از WSL (Ubuntu) استفاده کنید.

```bash
git clone https://github.com/WebNetData/MoboComCMS.git mobocom && cd mobocom
npm ci --no-audit --no-fund
npm run build:postgres
```

سپس بستهٔ آپلود را بسازید (بدون `.git`، فایل‌های تنظیمات محلی و داده‌های محلی):

```bash
tar --exclude=.git --exclude=.env --exclude='.next-dev' --exclude='storage' --exclude='prisma/dev.db' -czf mobocom-host.tgz .
```

### قدم ۳ — ساخت Node.js App در پنل

cPanel ← **Setup Node.js App** ← **Create Application**:

| فیلد | مقدار |
| --- | --- |
| Node.js version | 22 (یا 20) |
| Application mode | Production |
| Application root | `mobocom` (پوشه‌ای در home) |
| Application URL | دامنهٔ شما |
| Application startup file | `deploy/hosting/app.cjs` |

در همان صفحه، بخش **Environment variables** را اضافه کنید:

| نام | مقدار |
| --- | --- |
| `NODE_ENV` | `production` |
| `NEXTAUTH_URL` | `https://example.com` |
| `NEXTAUTH_SECRET` | یک مقدار تصادفی ۶۴ نویسه‌ای |
| `INTERNAL_JOBS_SECRET` | یک مقدار تصادفی ۶۴ نویسه‌ای دیگر |
| `PANEL_CREDENTIAL_KEY` | یک مقدار تصادفی ۶۴ نویسه‌ای دیگر (هرگز عوضش نکنید) |
| `DATABASE_URL` | آدرس قدم ۱ |
| `BACKGROUND_JOBS` | `false` |
| `INTERNAL_APP_ORIGIN` | `https://example.com` |
| `SITE_LOCALES` | `fa` |

مقدار تصادفی را روی کامپیوتر خودتان با `openssl rand -hex 32` بسازید. برنامه را فعلاً **Stop** نگه دارید.

### قدم ۴ — آپلود و باز کردن فایل‌ها

1. در **File Manager** وارد پوشهٔ `mobocom` شوید و `mobocom-host.tgz` را آپلود کنید.
2. روی فایل **Extract** بزنید، سپس فایل tgz را پاک کنید.
3. پوشهٔ `storage` را در همان‌جا بسازید (تصاویر، فایل‌های ورودی و تنظیمات در آن ذخیره می‌شوند و با به‌روزرسانی نباید پاک شوند).

### قدم ۵ — مایگریشن و مدیر اول (در ترمینال هاست)

در بالای صفحهٔ Node.js App یک دستور `source …/activate` نشان داده می‌شود؛ آن را در **Terminal** اجرا کنید تا Node و متغیرهای برنامه فعال شوند. سپس:

```bash
cd ~/mobocom
npm run deploy:migrate
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="یک-رمز-خیلی-قوی" SEED_DEMO_DATA=false npm run deploy:seed
```

(دستور seed را فقط یک بار، روی دیتابیس خالی اجرا کنید.)

### قدم ۶ — روشن کردن برنامه و SSL

1. در صفحهٔ Node.js App روی **Start** (یا Restart) بزنید.
2. از **SSL/TLS Status** برای دامنه گواهی AutoSSL بگیرید.
3. `https://example.com/api/health/ready` را باز کنید؛ باید پاسخ سالم بدهد. سپس وارد `/admin` شوید.

### قدم ۷ — Cron Jobs (برای هاست ضروری است)

روی هاست، Passenger برنامهٔ بیکار را خاموش می‌کند؛ پس کارهای پس‌زمینه (از جمله اجرای ورود گروهی) باید با Cron اجرا شوند. در cPanel ← **Cron Jobs** این‌ها را اضافه کنید (مسیر `activate` را از صفحهٔ Node.js App بردارید):

```cron
* * * * * source /home/USER/nodevenv/mobocom/22/bin/activate && cd /home/USER/mobocom && node scripts/run-internal-job.cjs imports >/dev/null 2>&1
* * * * * source /home/USER/nodevenv/mobocom/22/bin/activate && cd /home/USER/mobocom && node scripts/run-internal-job.cjs fulfillment >/dev/null 2>&1
*/5 * * * * source /home/USER/nodevenv/mobocom/22/bin/activate && cd /home/USER/mobocom && node scripts/run-internal-job.cjs store-marketing >/dev/null 2>&1
*/10 * * * * source /home/USER/nodevenv/mobocom/22/bin/activate && cd /home/USER/mobocom && node scripts/run-internal-job.cjs reminders >/dev/null 2>&1
*/15 * * * * source /home/USER/nodevenv/mobocom/22/bin/activate && cd /home/USER/mobocom && node scripts/run-internal-job.cjs engage >/dev/null 2>&1
```

این اسکریپت‌ها با `INTERNAL_JOBS_SECRET` به آدرس `INTERNAL_APP_ORIGIN` درخواست می‌زنند؛ اگر پنل متغیرهای برنامه را به cron نمی‌دهد، این دو را به اول هر خط اضافه کنید: `INTERNAL_JOBS_SECRET=... INTERNAL_APP_ORIGIN=https://example.com`.

در DirectAdmin همین تنظیمات در **Setup Node.js App** و **Cron Jobs** با نام‌های مشابه هست.

### قدم ۸ — به‌روزرسانی روی هاست

1. روی لینوکس خودتان: `git pull && npm ci && npm run build:postgres` و ساخت دوبارهٔ `mobocom-host.tgz` (قدم ۲).
2. در هاست برنامه را **Stop** کنید، بسته را آپلود و Extract کنید (پوشهٔ `storage` دست نمی‌خورد، چون در بسته نیست).
3. در ترمینال: `npm run deploy:migrate`.
4. برنامه را **Start** کنید.

### عیب‌یابی هاست

- **صفحهٔ خطای Passenger / 503:** در Node.js App گزینهٔ لاگ (`stderr.log` در پوشهٔ برنامه) را ببینید. پیام‌های `NEXTAUTH_URL must use https` یا `DATABASE_URL must point to PostgreSQL` یعنی متغیرهای قدم ۳ درست نیست.
- **`sharp` یا Prisma خطای «could not load» می‌دهد:** برنامه روی لینوکس x64 ساخته نشده است (قدم ۲).
- **خطای کمبود رم یا کندی شدید:** سقف رم پروسه در هاست کم است؛ از پشتیبانی هاست افزایش بخواهید یا به VPS بروید.
- **ورود گروهی در حالت «در صف» می‌ماند:** Cron خط `imports` اجرا نمی‌شود؛ خروجی آن را به‌جای `/dev/null` در یک فایل بریزید و خطا را ببینید.

---

## بخش ج — راه‌اندازی و استفاده از «ورود گروهی اطلاعات»

### ۱. دسترسی

- نقش **مدیر کل** دسترسی `imports.manage` را خودکار (با مایگریشن) می‌گیرد.
- برای بقیه: پنل مدیریت ← **نقش‌ها و دسترسی‌ها** ← نقش مورد نظر ← تیک **📥 Bulk import**. دسترسی «تنظیمات» به‌تنهایی اجازهٔ ورود گروهی نمی‌دهد.
- منوی **تنظیمات و دسترسی‌ها ← ورود گروهی اطلاعات** (`/admin/imports`).

### ۲. پیش از اولین ورود محصول

1. در **فروشگاه ← گروه‌های ویژگی** گروه‌ها را بسازید (مثلاً «گوشی موبایل» با رنگ و حافظه به‌عنوان «ویژگی تنوع» و دوربین/رم به‌عنوان مشخصهٔ ثابت).
2. در **دسته‌بندی محصولات** گروه را به دستهٔ بالادستی وصل کنید (مثلاً «موبایل»)؛ زیردسته‌ها (Apple ← iPhone) خودکار از آن ارث می‌برند.
3. ماژول بخش مقصد (فروشگاه، مجله، سینما، بازی، نرم‌افزار، موسیقی) باید روشن باشد.

### ۳. مراحل جادوگر

1. **مقصد** — فروشگاه، مجله، فیلم، سریال، بازی، نرم‌افزار یا موسیقی.
2. **فایل** — JSON، CSV یا XLSX تا ۲۵ مگابایت و ۲۰٬۰۰۰ رکورد. «نام منبع» (مثلاً `supplier-a`) را برای هر تأمین‌کننده ثابت نگه دارید تا ورود دوباره رکورد تکراری نسازد.
3. **نگاشت فیلدها** — خودکار پیشنهاد می‌شود؛ بررسی و در صورت نیاز «ذخیره به‌عنوان الگو».
4. **روابط و ویژگی‌ها** — ساختار تنوع (تو در تو یا مسطح با ستون والد مثل `parent_sku`)، ستون‌های ویژگی و تیک «ترکیب تنوع»، رفتار دستهٔ/برند/گروه/ویژگی/گزینهٔ ناموجود.
5. **پیش‌نمایش** — ۵ تا ۲۰ رکورد اول؛ هر فیلد «وارد می‌شود / نادیده / جدید» را نشان می‌دهد.
6. **اجرای آزمایشی** — همهٔ رکوردها با قوانین واقعی بررسی می‌شوند و **هیچ چیزی ذخیره نمی‌شود**؛ «ویژگی‌های ناشناخته و گزینه‌های جدید» همین‌جا فهرست و قابل نگاشت دستی‌اند.
7. **انتخاب فیلدها** — برای هر فیلد «ساخت» و «به‌روزرسانی» جدا (هر دو خاموش = نادیده). مثلاً با خاموش کردن به‌روزرسانی قیمت، قیمت محصولات موجود دست نمی‌خورد.
8. **تنظیمات ورود** — رکوردهای موجود (رد / به‌روزرسانی فیلدهای انتخابی / فقط فیلدهای خالی / جایگزینی)، تنوع‌های غایب (**بدون تغییر** پیش‌فرض / غیرفعال / حذف با تأیید جدا).
9. **شروع** — فقط اگر اجرای آزمایشی با همین تنظیمات انجام شده باشد. ورود در پس‌زمینه و در دسته‌های ۲۵تایی اجرا می‌شود.
10. **گزارش** — پیشرفت زنده، توقف/ادامه/لغو، رکوردها با خطا و هشدار، خروجی CSV/JSON خطاها و **بازگردانی (Rollback)**.

### ۴. نکته‌های عملیاتی

- ورودی‌های قبلی و گزارش‌هایشان در **تاریخچه** می‌مانند و با پاک‌سازی صف پس‌زمینه از بین نمی‌روند.
- فایل‌های بارگذاری‌شده در `storage/imports` (غیرعمومی) نگه داشته می‌شوند؛ پیش‌نویس‌های شروع‌نشده پس از یک هفته پاک می‌شوند.
- تصاویر فقط از نشانی‌های عمومی http/https دریافت و در کتابخانهٔ تصاویر سایت (`storage/covers`) ذخیره می‌شوند؛ نشانی‌های داخلی شبکه و متادیتای ابری رد می‌شوند و تصویر خراب فقط هشدار می‌دهد.
- فقط داده‌هایی را وارد کنید که حق استفاده از آن‌ها را دارید. این سیستم خزنده (crawler) نیست و وارد سایت دیگری نمی‌شود.
- آزمون کامل روی نسخهٔ توسعه: `IMPORT_ALLOW_LOOPBACK=1 npm run dev` و در ترمینال دیگر `npm run test:imports` (فقط روی سیستم توسعه، نه سرور واقعی).
