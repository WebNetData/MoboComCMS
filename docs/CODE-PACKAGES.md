# بسته‌های کددار و ویرایش کد قالب/افزونه‌های داخلی

بسته‌های «بدون کد» (HTML/CSS) فوری نصب می‌شوند (ببینید [PACKAGES.md](PACKAGES.md)). وقتی افزونه یا
قالبی به React/TypeScript، API یا رویدادهای سرور نیاز دارد، از بستهٔ **کددار** استفاده کنید.

## چرخهٔ کار

1. آپلود ‎.zip با `"runtime": "code"` در «افزونه‌ها و ماژول‌ها»؛ یا از فهرست «ویرایش کد قالب/افزونهٔ داخلی»
   سورس یک قالب/افزونهٔ موجود (مثلاً `clean` یا `orbital`) را باز کنید.
2. در «ویرایشگر افزونه و قالب» فایل‌ها را تغییر دهید. تغییرات ذخیره و در تاریخچه ثبت می‌شوند ولی هنوز اجرا نمی‌شوند.
3. «اعمال و build» را بزنید:
   - **git**: همهٔ فایل‌ها در یک commit در `src/plugins/<id>` یا `src/themes/code/<id>` روی شاخهٔ تنظیم‌شده
     ثبت می‌شوند (فایل‌های حذف‌شده از بسته، از مخزن هم حذف می‌شوند). Coolify با push، build را شروع می‌کند.
     Dockerfile قبل از build همهٔ بررسی‌ها (`release:check`: معماری، امنیت، typecheck، تست‌ها) را اجرا می‌کند؛
     اگر کد خراب باشد deploy انجام نمی‌شود و **نسخهٔ فعلی سایت بالا می‌ماند**.
   - **local**: فایل‌ها مستقیم در `./src` همین سرور نوشته می‌شوند و registry دوباره ساخته می‌شود
     (برای محیط توسعه؛ در production باید build و ری‌استارت کنید).
4. بعد از بالا آمدن نسخهٔ جدید، افزونهٔ جدید در فهرست «افزونه‌ها» ظاهر می‌شود و از همان‌جا فعال می‌شود.

## تنظیمات (Environment در Coolify)

```bash
PACKAGE_APPLY_MODE=git
PACKAGE_GIT_TOKEN=github_pat_...       # Fine-grained token: فقط همین مخزن، Contents: Read and write
PACKAGE_GIT_REPO=WebNetData/MoboComCMS
PACKAGE_GIT_BRANCH=main                # شاخه‌ای که Coolify از آن deploy می‌کند
PACKAGE_DEPLOY_WEBHOOK=                # اختیاری: Deploy Webhook خود Coolify
PACKAGE_DEPLOY_TOKEN=                  # اختیاری: API token کولـیفای برای webhook
```

اگر Coolify روی «Auto Deploy» تنظیم شده باشد، webhook لازم نیست.

## امنیت

- کد این بسته‌ها با **دسترسی کامل سرور** اجرا می‌شود؛ فقط کد مورد اعتماد را اعمال کنید.
- اعمال کد و باز کردن سورس داخلی نیاز به دسترسی جدای `extensions.code` دارد (نقش «مدیر کل» آن را دارد؛
  بعد از آپدیت یک بار `npm run db:seed` یا ویرایش نقش در «نقش‌ها» لازم است). مدیریت بسته‌ها بدون کد فقط
  `settings.manage` می‌خواهد.
- کد هرگز از دیتابیس اجرا نمی‌شود؛ فقط از طریق build عادی و بررسی‌های release.
- به‌روزرسانی شاخه fast-forward است؛ اگر هم‌زمان کسی push کرده باشد، اعمال خطا می‌دهد و چیزی بازنویسی نمی‌شود.
- همهٔ عملیات در Audit Log ثبت می‌شوند؛ حذف بسته از پنل، کدی را که قبلاً اعمال شده از مخزن حذف نمی‌کند.

## ساختار بستهٔ کددار

همان ساختار افزونه/قالب داخلی ([EXTENSIONS.md](EXTENSIONS.md)، [THEMES.md](THEMES.md)) به‌علاوهٔ `"runtime": "code"`:

```text
hello-code.zip
├── manifest.json   # "apiVersion": 1، "kind": "plugin"، "runtime": "code"، ...
├── client.tsx      # ui slots / AdminPage
└── server.ts       # api / events / jobs (اختیاری)
```

نمونه: `docs/packages/examples/hello-code`.
