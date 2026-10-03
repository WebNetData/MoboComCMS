# نصب موبوکام روی سرور اوبونتو (بدون پنل)

این راهنما برای **Ubuntu 22.04 یا 24.04** است: برنامه با systemd اجرا می‌شود، Nginx جلوی آن قرار می‌گیرد، گواهی SSL از Let's Encrypt گرفته می‌شود و دیتابیس PostgreSQL روی همان سرور است. هیچ پنل یا cron جداگانه‌ای لازم نیست؛ کارهای پس‌زمینه (پردازش سفارش‌ها، صف انتشار تلگرام/اینستاگرام، یادآوری‌ها، فهرست جست‌وجو) داخل خود برنامه اجرا می‌شوند.

> دستورها را با کاربری که دسترسی `sudo` دارد اجرا کنید. هر جا `example.com` آمده، دامنهٔ خودتان را بگذارید.

## ۱. سرور

حداقل پیشنهادی: ۲ هستهٔ پردازنده، ۴ گیگ رم، ۴۰ گیگ فضای SSD. ساخت (build) برنامه حدود ۳ گیگ رم می‌خواهد؛ روی سرور ۴ گیگی حتماً swap بسازید:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

به‌روزرسانی و دیواره‌آتش (قبل از فعال‌کردن ufw مطمئن شوید پورت SSH باز است):

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl ca-certificates gnupg ufw
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

## ۲. نصب Node.js، PostgreSQL و Nginx

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs

# PostgreSQL 17 (مخزن رسمی)
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt -y install postgresql-17

# Nginx و Certbot
sudo apt -y install nginx certbot python3-certbot-nginx
```

## ۳. دیتابیس

یک رمز قوی بسازید و کاربر و دیتابیس را ایجاد کنید:

```bash
DB_PASS=$(openssl rand -hex 24); echo "رمز دیتابیس: $DB_PASS"
sudo -u postgres psql -c "CREATE USER mobocom WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE mobocom OWNER mobocom;"
```

PostgreSQL به‌صورت پیش‌فرض فقط روی `localhost` گوش می‌دهد؛ پورت آن را در دیواره‌آتش باز نکنید. بخش ۵ را در **همین پنجرهٔ ترمینال** ادامه دهید تا متغیر `DB_PASS` در دسترس باشد.

## ۴. کاربر و کد برنامه

```bash
sudo useradd --system --create-home --home-dir /opt/mobocom --shell /bin/bash mobocom
sudo -u mobocom git clone https://github.com/WebNetData/MoboComCMS.git /opt/mobocom/app
sudo -u mobocom mkdir -p /opt/mobocom/app/storage /opt/mobocom/app/var
```

اگر مخزن خصوصی است، یک «Deploy key» فقط‌خواندنی در GitHub بسازید (کلید SSH کاربر `mobocom`) و آدرس `git@github.com:WebNetData/MoboComCMS.git` را clone کنید.

## ۵. تنظیمات (متغیرهای محیطی)

فایل تنظیمات بیرون از پوشهٔ کد نگه داشته می‌شود تا با به‌روزرسانی پاک نشود:

```bash
sudo mkdir -p /etc/mobocom
sudo tee /etc/mobocom/mobocom.env >/dev/null <<EOF
NODE_ENV=production
NEXTAUTH_URL=https://example.com
NEXTAUTH_SECRET=$(openssl rand -hex 32)
INTERNAL_JOBS_SECRET=$(openssl rand -hex 32)
# یک بار بسازید و هرگز عوض نکنید؛ کلیدهای پیامک، هوش مصنوعی و توکن‌ها با آن رمز می‌شوند.
PANEL_CREDENTIAL_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgresql://mobocom:$DB_PASS@127.0.0.1:5432/mobocom?schema=public
RUN_MIGRATIONS_ON_START=true
SITE_LOCALES=fa
SITE_APPEARANCE=light
EOF
sudo chown root:mobocom /etc/mobocom/mobocom.env && sudo chmod 640 /etc/mobocom/mobocom.env
```

از این فایل (به‌خصوص `PANEL_CREDENTIAL_KEY`) یک نسخه جای امن بیرون از سرور نگه دارید. بدون همین کلید، اطلاعات رمزشده در پشتیبان دیتابیس قابل بازیابی نیست.

متغیرهای اختیاری: `SUPPORT_EMAIL`، `VAPID_SUBJECT=mailto:support@example.com` (اعلان مرورگر)، `INVOICE_PREFIX`، و `BACKGROUND_JOBS=false` فقط اگر بخواهید کارهای پس‌زمینه را با cron بیرونی اجرا کنید.

## ۶. ساخت و اولین اجرا

```bash
cd /opt/mobocom/app
sudo -u mobocom bash -c 'npm ci --no-audit --no-fund && set -a && . /etc/mobocom/mobocom.env && set +a && NODE_OPTIONS=--max-old-space-size=3072 npm run build:postgres'
```

سرویس systemd را نصب و روشن کنید (در اولین اجرا مایگریشن‌های دیتابیس خودکار اعمال می‌شوند):

```bash
sudo cp deploy/ubuntu/mobocom.service /etc/systemd/system/mobocom.service
sudo systemctl daemon-reload && sudo systemctl enable --now mobocom
sudo systemctl status mobocom --no-pager
curl -s http://127.0.0.1:3000/api/health/ready
```

ساخت مدیر اول و داده‌های پایه (**فقط یک بار**):

```bash
cd /opt/mobocom/app
sudo -u mobocom bash -c 'set -a && . /etc/mobocom/mobocom.env && set +a && ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="یک-رمز-خیلی-قوی" SEED_DEMO_DATA=false npm run deploy:seed'
```

## ۷. Nginx و SSL

دامنه (رکورد A و در صورت نیاز AAAA) باید به IP سرور اشاره کند. سپس:

```bash
sudo cp deploy/ubuntu/nginx-mobocom.conf /etc/nginx/sites-available/mobocom
sudo sed -i 's/example.com/دامنه‌شما.ir/g' /etc/nginx/sites-available/mobocom
sudo ln -sf /etc/nginx/sites-available/mobocom /etc/nginx/sites-enabled/mobocom
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d دامنه‌شما.ir -d www.دامنه‌شما.ir --redirect
```

Certbot تمدید خودکار گواهی را خودش تنظیم می‌کند. اگر از Cloudflare استفاده می‌کنید، حالت SSL را روی **Full (strict)** بگذارید.

برنامه روی پورت ۳۰۰۰ اجرا می‌شود که دیواره‌آتش بخش ۱ آن را از بیرون بسته نگه می‌دارد؛ فقط Nginx (پورت ۸۰ و ۴۴۳) در دسترس عموم است.

حالا سایت روی `https://دامنه‌شما.ir` و پنل مدیریت روی `/admin` در دسترس است. در «تنظیمات عمومی» نشانی سایت را همان دامنهٔ https وارد کنید.

## ۸. کارهای پس‌زمینه

نیازی به cron نیست. خود برنامه هر دقیقه این‌ها را اجرا می‌کند و با یک قفل در دیتابیس مطمئن می‌شود دوبار اجرا نشوند:

- پیگیری پرداخت‌ها، تحویل سفارش‌ها، آزادسازی رزرو موجودی
- صف انتشار تلگرام، اینستاگرام و اعلان مرورگر (با تلاش مجدد)
- بازسازی فهرست جست‌وجو و پاک‌سازی آمار قدیمی (هر ۱۵ دقیقه)
- یادآوری‌های اشتراک

## ۹. پشتیبان‌گیری

پشتیبان روزانه (دیتابیس + فایل‌های آپلودی) ساعت ۳:۳۰ بامداد، با نگه‌داری ۱۴ روزه در `/var/backups/mobocom`:

```bash
sudo mkdir -p /var/backups/mobocom && sudo chown mobocom:mobocom /var/backups/mobocom
sudo cp deploy/ubuntu/mobocom-backup.service deploy/ubuntu/mobocom-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mobocom-backup.timer
sudo systemctl start mobocom-backup.service   # یک بار آزمایشی
ls -lh /var/backups/mobocom
```

مسیر بکاپ میزبان با `HOST_BACKUP_DIR` (مسیر مطلق و بیرون از پوشهٔ برنامه) تنظیم می‌شود؛ مقدار پیش‌فرض `/var/backups/mobocom` است. `BACKUP_DIR` برای بکاپ رمزگذاری‌شدهٔ داخل برنامه است و مقدار نسبی آن مسیر بکاپ میزبان را تغییر نمی‌دهد. اسکریپت قبل از انتشار فایل‌های بکاپ، قالب dump و سلامت آرشیو فایل‌ها را بررسی می‌کند.

پشتیبانی که فقط روی همان سرور باشد با خرابی سرور از بین می‌رود؛ پوشهٔ `/var/backups/mobocom` را مرتب به جای دیگری (کامپیوتر خودتان، سرور دوم یا فضای ابری) کپی کنید، مثلاً از کامپیوتر خودتان:

```bash
rsync -az root@IP_SERVER:/var/backups/mobocom/ ./mobocom-backups/
```

بازگردانی دیتابیس از یک فایل پشتیبان:

```bash
sudo systemctl stop mobocom
sudo -u postgres pg_restore --clean --if-exists --no-owner --role=mobocom -d mobocom /var/backups/mobocom/db-YYYYMMDD-HHMMSS.dump
sudo systemctl start mobocom
```

## ۱۰. به‌روزرسانی

هر بار که کد جدید در شاخهٔ `main` ادغام شد:

```bash
sudo -u mobocom bash /opt/mobocom/app/deploy/ubuntu/update.sh
```

پیش از جایگزینی کد، اسکریپت از PostgreSQL و فایل‌های آپلودی پشتیبان تازه می‌گیرد. اگر پشتیبان‌گیری شکست بخورد، به‌روزرسانی متوقف می‌شود؛ پوشهٔ `/var/backups/mobocom` باید برای کاربر `mobocom` قابل نوشتن باشد. به‌روزرسانی از پنل نیز همین شرط را دارد.

این اسکریپت کد را می‌گیرد، وابستگی‌ها را نصب و برنامه را می‌سازد و سرویس را دوباره اجرا می‌کند (مایگریشن‌ها هنگام اجرا اعمال می‌شوند). برای اینکه کاربر `mobocom` بتواند سرویس را ری‌استارت کند، یک بار این دسترسی را بدهید:

```bash
echo 'mobocom ALL=(root) NOPASSWD: /usr/bin/systemctl restart mobocom' | sudo tee /etc/sudoers.d/mobocom
sudo chmod 440 /etc/sudoers.d/mobocom
```

اگر نصب، ساخت، راه‌اندازی یا بررسی سلامت نسخهٔ جدید شکست بخورد، اسکریپت دستی کد قبلی را بازمی‌گرداند و دوباره آن را راه‌اندازی و بررسی می‌کند. اجرای هم‌زمان به‌روزرسانی دستی و پنل با قفل مشترک متوقف می‌شود. تغییرات محلی فایل‌های ردیابی‌شده و کامیت‌های محلی خارج از شاخهٔ هدف پیش از شروع باید تعیین تکلیف شوند؛ اسکریپت آن‌ها را پاک نمی‌کند. بازگشت برنامه، مایگریشن‌های اعمال‌شده روی پایگاه داده را برنمی‌گرداند؛ نسخه‌های پیاپی باید با طرح پایگاه داده سازگار بمانند.

## ۱۱. عیب‌یابی

| کار | دستور |
| --- | --- |
| لاگ زندهٔ برنامه | `sudo journalctl -u mobocom -f` |
| ۱۰۰ خط آخر لاگ | `sudo journalctl -u mobocom -n 100 --no-pager` |
| وضعیت سرویس | `sudo systemctl status mobocom` |
| ری‌استارت | `sudo systemctl restart mobocom` |
| سلامت برنامه | `curl -s http://127.0.0.1:3000/api/health/ready` |
| خطاهای Nginx | `sudo tail -f /var/log/nginx/error.log` |

خطاهای رایج:

- **سرویس بالا نمی‌آید و در لاگ `[preflight]` می‌بینید:** یکی از متغیرهای بخش ۵ درست نیست (مثلاً `NEXTAUTH_URL` باید https باشد و `PANEL_CREDENTIAL_KEY` دقیقاً ۶۴ کاراکتر هگز).
- **`502 Bad Gateway`:** برنامه اجرا نیست یا هنوز در حال بالا آمدن است؛ لاگ را ببینید.
- **ساخت (build) با `JavaScript heap out of memory` متوقف می‌شود:** swap بخش ۱ را بسازید.
- **آپلود فایل بزرگ خطای 413 می‌دهد:** مقدار `client_max_body_size` را در تنظیم Nginx بیشتر کنید.
