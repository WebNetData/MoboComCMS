# راهنمای توسعه‌دهندهٔ موبوکام (افزونه، قالب و ماژول)

این راهنما برای کسی است که می‌خواهد روی موبوکام افزونه یا قالب بنویسد، بستهٔ آماده منتشر کند یا بخشی از خود سیستم را گسترش دهد. مثل وردپرس: هسته را دست نمی‌زنید؛ **افزونه** رفتار اضافه می‌کند و **قالب** ظاهر را عوض می‌کند.

> دو نمونهٔ کامل و تست‌شده کنار خود پروژه هست: [افزونهٔ sample-feedback](../examples/plugins/sample-feedback/README.md) و [قالب sample-editorial](../examples/themes/sample-editorial/README.md). این راهنما را با باز کردن آن‌ها همراه کنید.

## ۱. نقشهٔ کلی

```text
src/platform/    زیرساخت مشترک (پایگاه داده، HTTP، امنیت) — فقط هسته و ماژول‌ها
src/modules/     ماژول‌های بزرگ (فروشگاه، مجله، تالار، تبلیغات، فرم‌ساز …): domain/ و server/
src/plugins/     افزونه‌ها؛ هر پوشه یک افزونه با manifest.json
src/themes/code/ قالب‌های کددار
src/extensions/  SDK پایدار افزونه‌ها (ذخیره‌سازی، کار پس‌زمینه، پاسخ JSON)
examples/        نمونه‌های آموزشی؛ با example:install در پروژه نصب می‌شوند
```

| می‌خواهید … | نوع بسته | نصب |
|---|---|---|
| یک بنر، متن یا صفحهٔ ثابت با HTML/CSS | افزونهٔ **بدون کد** (`runtime: declarative`) | آپلود zip از پنل — فوری، [راهنما](PACKAGES.md) |
| رفتار تازه با کد (API، رویداد، ویجت React) | افزونهٔ **کددار** در `src/plugins/<id>` | کد + build ([CODE-PACKAGES](CODE-PACKAGES.md)) |
| ظاهر سایت (رنگ، هدر، فوتر، صفحهٔ اصلی) | **قالب** طراحی (JSON/CSS) یا قالب کددار | آپلود zip یا `src/themes/code/<id>` |
| یک بخش کامل با جدول و پنل مدیریت | **ماژول** (`kind: module`) | بخشی از هسته، [بخش ۸](#۸-ماژول-ها) |

قانون طلایی: **هرچه با آپلود zip حل می‌شود، کد نویسید نه.** بستهٔ بدون کد هیچ‌گاه اجرا نمی‌شود و همیشه امن است.

## ۲. آماده‌سازی محیط

```bash
npm install
npm run dev            # http://localhost:3000 (پایگاه داده SQLite برای توسعه)
npm run check          # همهٔ بررسی‌ها و تست‌ها؛ پیش از هر انتشار
```

اگر سایت هنوز نصب نشده باشد، آدرس `/install` نصب‌کنندهٔ مرورگری را نشان می‌دهد؛ برای توسعه معمولاً `npm run setup` (ساخت جدول‌ها و مدیر پیش‌فرض) کافی است.

## ۳. شروع سریع: افزونه در ۵ دقیقه

```bash
npm run example:install -- plugin sample-feedback   # کپی به src/plugins و ساخت رجیستری‌ها
npm run dev
```

پنل مدیریت ← «افزونه‌ها» ← «بازخورد سریع (نمونه)» را فعال کنید و یک صفحهٔ عمومی را باز کنید. برای افزونهٔ خودتان:

```bash
npm run extension:new -- my-plugin       # ساخت اسکلت در src/plugins/my-plugin
npm run extensions:generate              # (خودکار پیش از dev و build هم اجرا می‌شود)
```

فایل‌های رجیستری در `src/extensions/generated/` را **هرگز** دستی ویرایش نکنید.

## ۴. آناتومی افزونه

```text
src/plugins/my-plugin/
├── manifest.json   # مشخصات، تنظیمات، دسترسی‌ها، منوی مدیریت
├── client.tsx      # جایگاه‌های رابط کاربری و AdminPage
└── server.ts       # API، رویدادها، کارهای پس‌زمینه، اعتبارسنجی تنظیمات
```

### manifest.json

| فیلد | توضیح |
|---|---|
| `id` | kebab-case و برابر نام پوشه؛ یکتا در کل سایت |
| `version` | نسخهٔ معنایی (`1.2.0`)؛ با هر انتشار بالا ببرید |
| `kind` | `plugin` (برای ماژول‌ها `module`) |
| `apiVersion` | فعلاً `1` |
| `requiresCore` | سازگاری با هسته، مثلاً `^1.0.0` (هر ۱٫x)؛ ناسازگار = ساخته نمی‌شود |
| `defaultEnabled` | پیش‌فرض خاموش بگذارید مگر ضروری باشد |
| `capabilities` | `ui`، `admin`، `api`، `events`، `jobs`، `settings`، `storage` (توضیحی است؛ منبع حقیقت رجیستری ساخته‌شده است) |
| `settings` | تنظیمات قابل ویرایش در کارت افزونه (زیر را ببینید) |
| `permissions` | دسترسی‌های نقش، مثل `my-plugin.manage`؛ خودکار وارد مدیریت نقش‌ها می‌شوند |
| `adminNavigation` | منوی مدیریت؛ آدرس باید زیر `/admin/extensions/<id>` باشد |

نمونهٔ کامل: [manifest افزونهٔ نمونه](../examples/plugins/sample-feedback/manifest.json).

**تنظیمات** (`settings[]`): `key` (حروف کوچک، عدد، `.` `_` `-`)، `label`، `type` یکی از `text`، `textarea`، `boolean`، `number`، `select` (با `options`)، `secret`؛ اختیاری: `default`، `required`، `public`.
- فقط تنظیمات `"public": true` به `client.tsx` می‌رسند. نوع `secret` هرگز به مرورگر نمی‌رسد و در پنل ماسک می‌شود.
- در `server.ts` تابع `validateSettings(settings)` را بنویسید تا ارتباط بین تنظیمات را پیش از ذخیره بسنجد؛ با پرتاب `Error` ذخیره رد می‌شود.

### client.tsx — رابط کاربری

```tsx
import type { PluginClientModule, PluginProps } from '@/plugins/types'
function Widget({ settings, locale, site }: PluginProps) { /* … */ }
export const plugin: PluginClientModule = {
  ui: [{ slot: 'site.before-footer', Component: Widget, order: 40 }],
  AdminPage,            // اختیاری: صفحهٔ مدیریت در /admin/extensions/<id>
}
```

جایگاه‌های پایدار (`slot`): `site.before-header`، `site.after-header`، `site.before-footer`، `site.after-footer`، `home.before-main`، `home.after-main`، `dashboard.top`، `dashboard.bottom`، `miniapp.home`. `order` کوچک‌تر زودتر می‌آید.

نکته‌ها: کامپوننت باید در نبود localStorage/کوکی هم درست کار کند (`try/catch`)؛ برای دسترس‌پذیری از `role`، `aria-*` و دکمهٔ واقعی استفاده کنید؛ متن‌ها را با `locale` فارسی/انگلیسی بدهید.

### server.ts — API، رویداد، کار پس‌زمینه

```ts
import { extensionJson } from '@/extensions/sdk/server'
import type { PluginServerModule } from '@/extensions/server/types'

export const plugin: PluginServerModule = {
  api: [{ method: 'POST', path: '/vote', access: 'public', async handler(req, ctx) { /* … */ return extensionJson({ ok: true }) } }],
  events: { async 'order.created'(payload, ctx) { /* … */ } },
  jobs: { async recount(payload, ctx) { /* … */ } },
  validateSettings(settings) { /* throw new Error('…') */ },
}
```

- مسیر API می‌شود `/api/extensions/<id>/<path>` و فقط وقتی افزونه فعال است وجود دارد.
- `access`: `public`، `authenticated` یا `permission:<id>`. در روت‌های `permission:` مقدار `ctx.actor` کاربر تأییدشده است. مجوز را **همیشه** سمت سرور بسنجید؛ پنهان‌کردن منو مجوز نیست.
- روت‌های `public` خودشان باید **محدودیت نرخ** (`rateLimitHit`) و اعتبارسنجی هر فیلد داشته باشند.
- `ctx.storage` (`get`/`set`/`delete`): ذخیره‌سازی JSON اختصاصی افزونه؛ هر مقدار تا حدود ۱۰۰ کیلوبایت. برای داده‌های حجیم یا پرترافیک از جدول پایگاه داده (ماژول) استفاده کنید.
- رویدادهای هسته: `user.created`، `order.created`، `payment.completed`، `ticket.created`، `fulfillment.completed`. خطای handler سفارش را برنمی‌گرداند؛ کار سنگین را با `ctx.enqueueJob(name, payload, dedupeKey)` به صف پایدار بسپارید (تکرار خودکار، جلوگیری از اجرای دوباره با `dedupeKey`).

### مرز افزونه

افزونه‌ها فقط از SDK پایدار (`@/extensions/*`)، `@/platform/http/*` و `@/plugins/types` استفاده می‌کنند. وارد کردن Prisma، `@/modules/*` یا `next/server` مستقیم ممنوع است و `npm run arch:check` آن را رد می‌کند. اگر امکانی کم است، یک عملیات باریک به SDK اضافه کنید، نه اینکه از داخل هسته import کنید.

## ۵. قالب‌ها

```bash
npm run example:install -- theme sample-editorial   # یا: npm run theme:new -- my-theme
```

```text
src/themes/code/my-theme/
├── manifest.json   # مشخصات + design.colors / design.lightColors / radius
├── client.tsx      # Header و Footer (اختیاری)
├── home.tsx        # صفحهٔ اصلی (اختیاری)
└── theme.css       # استایل با پیشوند html[data-design="<id>"]
```

- هر بخشی را که ننویسید از قالب پیش‌فرض می‌آید. از SDK (`@/themes/sdk/client` و `@/themes/sdk/server`) کامپوننت‌های پیش‌فرض، جست‌وجو، سوییچ زبان و خروجی افزونه‌ها را بگیرید تا همه‌چیز کار کند.
- قالب داده را آماده می‌گیرد؛ هرگز پایگاه داده، قیمت‌گذاری یا مجوز را خودش نمی‌سنجد.
- رنگ‌ها را در `manifest.json` بگذارید تا مدیر بتواند در «صفحه اصلی، ظاهر و منوها» تغییر دهد و مینی‌اپ تلگرام هم همان را بگیرد.
- برای تغییر ساده که نیازی به کد ندارد قالب طراحی (فقط رنگ/CSS) بسازید: [THEMES.md](THEMES.md).

## ۶. بستهٔ بدون کد (zip)

برای بنر و صفحهٔ ثابت: `manifest.json` با `runtime: declarative`، پوشه‌های `slots/`، `pages/`، `assets/` و `style.css`. ساخت zip: `npm run package:zip -- docs/packages/examples/promo-banner` و آپلود از پنل. قوانین امنیتی (پاک‌سازی HTML، محدودیت حجم) در [PACKAGES.md](PACKAGES.md).

## ۷. تست و کیفیت

| ابزار | کار |
|---|---|
| `npm run check` | معماری، schema، امنیت، i18n، تست‌های واحد، typecheck — باید سبز باشد |
| `npm run arch:check` | مرز افزونه/قالب/ماژول |
| `npm run test:e2e` | مرورگر واقعی؛ نمونه‌ها را در [e2e/tests/examples.spec.ts](../e2e/tests/examples.spec.ts) ببینید |

منطق خالص (اعتبارسنجی، قواعد) را در فایل بدون import بنویسید تا مثل [scripts/forms.test.cjs](../scripts/forms.test.cjs) با `node --test` تست شود. برای هر راه عمومی، حالت خطا و مجوز را هم تست کنید، نه فقط حالت موفق.

## ۸. ماژول‌ها

بخش‌های بزرگ (فروشگاه، تالار، تبلیغات، فرم‌ساز …) ماژول‌اند: `kind: "module"` در `src/plugins/<id>/manifest.json` و کد در `src/modules/<id>/`:

```text
src/modules/<id>/domain/   قواعد خالص بدون import از زیرساخت (قابل تست مستقیم)
src/modules/<id>/server/   سرویس‌ها، دسترسی به پایگاه داده، هندلرهای HTTP
src/app/admin/<id>/        صفحه‌های مدیریت (کلاینت)
src/app/api/…              فقط re-export هندلرها
prisma/                    مدل‌ها در هر دو schema (SQLite و PostgreSQL) + migration
```

فیلدهای ویژهٔ ماژول در manifest: `requires`، `publicPaths`، `adminPaths`، `adminMenu`، `category`، `icon`. مرجع خوب برای الگو: ماژول تبلیغات ([manifest](../src/plugins/ads/manifest.json)) و فرم‌ساز ([domain](../src/modules/forms/domain/forms.ts)). هر تغییر مدل باید در `prisma/schema.prisma` و `prisma/schema.postgresql.prisma` یکسان باشد و یک migration PostgreSQL داشته باشد (`npm run schema:check`). جزئیات: [EXTENSIONS.md](EXTENSIONS.md).

## ۹. چک‌لیست امنیتی

- هر ورودی (بدنه، query، هدر، فایل) را در مرز سیستم اعتبارسنجی کنید؛ مقدارها را با نوع و طول بررسی کنید.
- روت‌های عمومی: محدودیت نرخ، نبودن اطلاعات حساس در پاسخ، پیام خطای بی‌جزئیات.
- هیچ‌وقت HTML کاربر را بدون پاک‌سازی نمایش ندهید؛ URL را فقط `http(s)` بپذیرید.
- رازها را در تنظیم نوع `secret` نگه دارید؛ در لاگ و پاسخ نیاورید.
- فایل آپلودی را با محتوا (magic bytes) بسنجید، نه با پسوند؛ در پوشهٔ خصوصی نگه دارید.
- عملیات پولی: کلید idempotency، تراکنش، و ثبت در Audit Log.

## ۱۰. انتشار و نسخه‌بندی

1. `version` را بالا ببرید (نسخهٔ معنایی: رفع باگ = patch، امکان جدید سازگار = minor، تغییر ناسازگار = major).
2. `requiresCore` را دقیق نگه دارید.
3. `npm run check` را بگیرید.
4. بستهٔ بدون کد: `npm run package:zip -- <پوشه>`؛ بستهٔ کددار: پوشه را در Git/zip بدهید (کاربر با «اعمال و build» یا کپی در `src/plugins` نصب می‌کند).
5. یادداشت تغییرات بنویسید: چه چیزی عوض شد، آیا تنظیمات/جدول جدید دارد، و راه برگشت.

## ۱۱. عیب‌یابی

| نشانه | علت و راه‌حل |
|---|---|
| `invalid setting key …` هنگام ساخت | کلید تنظیم باید با حرف کوچک شروع شود و فقط `a-z 0-9 . _ -` داشته باشد |
| `manifest id must match directory name` | `id` با نام پوشه یکی نیست |
| `plugins cannot import core server internals` | از Prisma، `next/server` یا `@/modules/*` import کرده‌اید؛ از SDK استفاده کنید (`extensionJson`، `ctx.storage`) |
| افزونه در فهرست نیست | `npm run extensions:generate` و راه‌اندازی مجدد `npm run dev` |
| API شما ۴۰۴ می‌دهد | افزونه غیرفعال است، مسیر/متد با `api[]` نمی‌خواند، یا بعد از تغییر رجیستری راه‌اندازی مجدد نکرده‌اید |
| تنظیم به کلاینت نمی‌رسد | `"public": true` نیست یا نوع آن `secret` است |
| قالب اعمال نمی‌شود | `design.id` برابر `id` نیست یا قالب در «صفحه اصلی، ظاهر و منوها» انتخاب نشده |

پرسش یا مشکل؟ مستندات مرجع: [EXTENSIONS.md](EXTENSIONS.md)، [THEMES.md](THEMES.md)، [PACKAGES.md](PACKAGES.md)، [ARCHITECTURE.md](ARCHITECTURE.md).
