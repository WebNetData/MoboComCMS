# بسته‌های آپلودی (افزونه و قالب) / Uploadable packages

MoboComCMS دو نوع توسعه دارد:

| | بستهٔ آپلودی «بدون کد» (`declarative`) | بستهٔ «کددار» (`code`) و افزونه‌های داخلی |
| --- | --- | --- |
| نصب | آپلود ‎.zip در «افزونه‌ها و ماژول‌ها» — **فوری** | آپلود ‎.zip ← «اعمال و build» ← استقرار خودکار |
| محتوا | HTML، CSS، JSON، Markdown، تصویر و فونت | کد TypeScript/React (مثل `src/plugins/*`) |
| اجرای کد | هرگز؛ HTML پاک‌سازی می‌شود | بعد از build و بررسی‌های release |
| ویرایشگر | «ویرایشگر افزونه و قالب»؛ ذخیره = اعمال فوری | ذخیره = آماده برای build بعدی |

## ساختار بسته

```text
my-package.zip
├── manifest.json
├── slots/banner.fa.html    # محتوای یک جایگاه (slot)
├── pages/about.fa.html     # صفحهٔ عمومی در /ext/<id>/<slug>
├── style.css               # روی تمام صفحات بارگذاری می‌شود (افزونهٔ فعال / قالب فعال)
└── assets/logo.svg         # تصویر و فونت
```

یک پوشهٔ بالایی در zip مجاز است. ساخت zip از یک پوشه:

```bash
npm run package:zip -- docs/packages/examples/promo-banner
```

## manifest.json

```json
{
  "id": "promo-banner",
  "name": "بنر تبلیغاتی",
  "nameEn": "Promo banner",
  "version": "1.0.0",
  "kind": "plugin",
  "runtime": "declarative",
  "requiresCore": "^1.0.0",
  "slots": { "home.before-main": { "fa": "slots/banner.fa.html", "en": "slots/banner.en.html" } },
  "styles": ["style.css"],
  "pages": [{ "slug": "campaign", "title": { "fa": "کمپین", "en": "Campaign" }, "file": "pages/campaign.html", "nav": true }],
  "settings": [{ "key": "code", "label": "کد تخفیف", "type": "text", "default": "HAPPY30" }]
}
```

- `id`: kebab-case و یکتا؛ شناسهٔ افزونه‌ها و قالب‌های داخلی رزرو است.
- `kind`: `plugin` یا `theme`.
- جایگاه‌ها (slots): `site.before-header`، `site.after-header`، `site.before-footer`، `site.after-footer`، `home.before-main`، `home.after-main`، `dashboard.top`، `dashboard.bottom`، `miniapp.home`.
- هر فایل slot/page می‌تواند یک رشته باشد یا `{ "fa": …, "en": … }`.
- `pages[].nav: true` صفحه را به منوی اصلی اضافه می‌کند.
- `settings` (نوع `text` یا `textarea`) در کارت افزونه قابل ویرایش است و در HTML با `{{settings.key}}` استفاده می‌شود.
- `components` کامپوننت صفحه‌ساز تعریف می‌کند: `name` (kebab-case)، `title: { fa, en }`، `category` و `description` اختیاری، `template` (فایل .html یا `{ fa, en }`)، `style` (فایل .css؛ `selector` یعنی ریشهٔ کامپوننت) و `fields` با نوع‌های text، textarea، color، number، url، image، select و toggle. در قالب با `{{field.key}}` و برای نمایش شرطی با `{{#field.key}}…{{/field.key}}` استفاده کنید. کامپوننت افزونه جاوااسکریپت ندارد، مقدار فیلدها ایمن‌سازی می‌شود و خروجی از همان پاک‌ساز HTML افزونه‌ها می‌گذرد. نمونه: `docs/packages/examples/promo-banner`.

### قالب

```json
{
  "id": "ocean", "name": "Ocean", "version": "1.0.0", "kind": "theme",
  "design": {
    "extends": "clean",
    "radius": 22,
    "colors":      { "background": "#061417", "surface": "#0b2127", "accent": "#2dd4bf", "text": "#e8fbf8", "muted": "#8fb3ae", "border": "#15363d" },
    "lightColors": { "background": "#f3fbfa", "surface": "#ffffff", "accent": "#0d9488", "text": "#082f2c", "muted": "#4f6f6b", "border": "#d5ebe8" }
  },
  "styles": ["theme.css"]
}
```

قالب آپلودی به فهرست قالب‌های Site Studio اضافه می‌شود و با «فعال‌سازی» قالب سایت و **مینی‌اپ تلگرام** می‌شود. `extends` قالب کدی پایه است که ساختار صفحه را می‌سازد (پیش‌فرض `clean`). CSS قالب فقط وقتی قالب فعال است بارگذاری می‌شود، پس به پیشوند نیاز ندارد.

## بستهٔ راه‌اندازی کسب‌وکار (Solution Pack v1)

Solution Pack پیکربندی است، نه نسخهٔ جداگانهٔ موبوکام. یک بستهٔ عادی
`plugin` با `runtime: declarative` می‌تواند به‌جای خروجی نمایشی، قرارداد زیر
را داشته باشد. میزبان باید پشتیبانی Solution Pack v1 را داشته باشد.

```json
{
  "id": "my-editorial-pack",
  "name": "راه‌اندازی مجله",
  "version": "1.0.0",
  "kind": "plugin",
  "runtime": "declarative",
  "requiresCore": "^1.0.0",
  "solutionPack": {
    "apiVersion": 1,
    "modules": [
      { "id": "journal", "version": "^1.0.0", "defaults": { "seo.description": "یادداشت‌ها و مقاله‌های تازه" } },
      { "id": "block-editor", "version": "^1.0.0" }
    ],
    "recommendations": ["promo-banner"]
  }
}
```

نمونه‌های آماده: [مجله](../examples/packages/solution-editorial/manifest.json)
و [فروشگاه و خدمات](../examples/packages/solution-shop-services/manifest.json).
ساخت ZIP همان `npm run package:zip -- <folder>` است. در مخزن موجود محصولی
از نوع **PLUGIN** با شناسهٔ برابر `id` بسازید، قیمت/ظرفیت/دورهٔ پشتیبانی را
همان‌جا تنظیم و ZIP را به‌عنوان نسخهٔ محصول منتشر کنید. امضا، SHA، اندازه،
مجوز محصول/سایت و اجازهٔ به‌روزرسانی از مسیر فعلی مخزن بررسی می‌شوند.

نصب و دانلود هیچ ماژولی را فعال نمی‌کنند. در کارت بسته «بررسی پیکربندی» را
بزنید؛ ماژول‌های قابل فعال‌شدن، پیش‌فرض‌های جدید و تنظیمات حفظ‌شونده را
ببینید، سپس فهرست را تأیید و اعمال کنید. وابستگی خاموش باید صریحاً در بسته
باشد یا پیش‌تر فعال شده باشد. تغییر تنظیمات یا فایل بسته پس از پیش‌نمایش،
تأیید قبلی را بی‌اعتبار می‌کند. تکرار اعمال همین نسخه فقط رسید قبلی را
برمی‌گرداند؛ تصمیم‌های بعدی مدیر را بازنویسی نمی‌کند.

`defaults` فقط کلیدهای تعریف‌شده و غیرمحرمانهٔ همان ماژول را می‌پذیرد و فقط
مقدار ذخیره‌نشده را پر می‌کند. سیاست تخصصی کسب‌وکار از این مسیر تغییر نمی‌کند.
افزونهٔ پیشنهادی خودکار دانلود یا فعال نمی‌شود و به مجوز مستقل خود نیاز دارد.
نقش‌ها، مجوزها، قالب، منو و محتوا خودکار تغییر نمی‌کنند. همراه این قرارداد
فیلدهای slots/styles/pages/settings/components/design مجاز نیستند.

رسید در بسته و سابقه در Audit می‌ماند؛ حذف نصب، نصب دوباره، ارتقا یا لغو
لایسنس تنظیمات و دادهٔ ایجادشده را برنمی‌گرداند. لایسنس فعلی دریافت و
به‌روزرسانی محصول را کنترل می‌کند؛ قفل دائمی ماژول‌های داخلی نیست.

## محدودیت‌های امنیتی بسته‌ها

- `<script>`، رویدادهای `on*`، `iframe`، `form`، `style` درون‌خطی و `javascript:` هنگام نمایش حذف می‌شوند.
- در CSS، `@import` و هر `url()` غیر از https، data:image یا فایل همین بسته حذف می‌شود.
- مسیر فایل‌ها باید نسبی و بدون `..` باشد؛ فرمت‌های مجاز: html، css، json، md، txt، svg، png، jpg، webp، gif، avif، ico، woff، woff2 (و ts/tsx فقط در بستهٔ کددار).
- محدودیت: فایل آپلود ۳ مگابایت، هر فایل ۱ مگابایت، مجموع ۴ مگابایت، ۲۰۰ فایل.
- فقط تصاویر، فونت‌ها و CSS از `/api/public/packages/<id>/files/…` قابل دریافت عمومی‌اند (SVG در sandbox).
- همهٔ عملیات نیاز به دسترسی `settings.manage` دارند و در Audit Log ثبت می‌شوند.
- هر ذخیره در ویرایشگر در تاریخچه (۳۰ مورد آخر) ثبت می‌شود و قابل بازگردانی است.

## بستهٔ کددار

`"runtime": "code"` برای افزونه یا قالبی است که به React/TypeScript نیاز دارد. ساختار آن همان
`src/plugins/<id>` یا `src/themes/code/<id>` است (`"apiVersion": 1` الزامی است). این بسته‌ها بعد از
آپلود فقط ذخیره می‌شوند؛ با «اعمال و build» در Git ثبت و سپس build و مستقر می‌شوند. جزئیات
در [CODE-PACKAGES.md](CODE-PACKAGES.md).

نمونه‌ها: `docs/packages/examples/`.
