# MoboComCMS 1.4.5 — فروشگاه و مجله

این سند به کد همین نسخه ارجاع می‌دهد؛ نمونه‌ها شکل کوتاه‌شدهٔ منطق اجرایی‌اند. نمای فروشگاه از الگوی تصویر/مشخصات/خرید و نمای مجله از چیدمان تیرهٔ تصویریِ نمونه‌های ارسالی الهام گرفته‌اند، بدون کپی‌کردن قالب یا دارایی آن وب‌سایت‌ها.

## معماری و داده

در `prisma/schema.postgresql.prisma`، `Product` نوع `VIRTUAL | PHYSICAL`، دسته، تصویر/گالری، مشخصات، FAQ و گونه‌ها را نگه می‌دارد. `ProductCategory` درختی است و می‌تواند به `ProductAttributeGroup` وصل شود. گروه مشخصات شامل کلید، عنوان دو‌زبانه، نوع کنترل (`text | select | color`)، گزینه‌ها، اجباری‌بودن و `variant` است. گروهِ والد به زیردسته‌ها ارث می‌رسد. برای پول، `priceMinor` و `totalMinor` منبع محاسبات‌اند؛ فیلد Float فقط آینهٔ قدیمیِ نمایش است.

الگوی انتخاب‌شده **تعریف رابطه‌ای گروه + مقادیر JSON کنترل‌شده** است. این روش برای هر محصولِ کوچک و مشخصات متغیر مناسب است و از ستون‌های بی‌ربط یا EAV آزاد جلوگیری می‌کند. مقدار ویژگی فقط پس از تطبیق با گروه دسته ذخیره می‌شود. برای جست‌وجوی facet در مقیاس بزرگ می‌توان بعداً جدول ایندکسِ مشتق‌شده از همین داده ساخت؛ منبع حقیقت همچنان گروه و مقدار اعتبارسنجی‌شده است.

```ts
// src/modules/catalog/server/product-config.ts — منطق ذخیرهٔ موجود
const group = await attributeGroupForCategory(categoryId) // زنجیرهٔ والد را می‌پیماید
if (group.appliesTo !== 'ANY' && group.appliesTo !== productKind) throw Error('Incompatible category')
const specifications = validateSpecifications(form.specifications, group.fields)
// validateSpecifications کلید ناشناخته را رد می‌کند، فیلد اجباری و گزینهٔ select/color را می‌سنجد.
```

صفحه و API مشخصات فقط فیلدهای متعلق به گروه دسته را می‌خوانند. بنابراین «رنگ» در حساب مجازیِ دارای گروه «نوع اکانت» نه ذخیره می‌شود و نه نمایش داده می‌شود. گونه‌های کالا (`ProductVariant`) SKU، قیمت جزء، موجودی و ترکیب ویژگی‌های دارای `variant: true` را مستقل نگه می‌دارند.

`Order` با `userId`، `productId`، وضعیت `PAID` و `Invoice` با وضعیت `PAID` شاهد خرید تأییدشدهٔ همان محصول است. `ProductReview` برای هر `(productId,userId)` یکتا است و امتیاز کل و سه معیار کیفیت/ارزش/تجربه را نگه می‌دارد. `ProductQuestion` می‌تواند `userId = null` و `guestName` داشته باشد. پرسش و دیدگاه تا تأیید مدیریت `PENDING` می‌مانند.

## ثبت دیدگاه و پرسش

مسیر `POST /api/products/[slug]/feedback` امتیاز را روی سرور محاسبه می‌کند، نه بر اساس میانگین ارسالی مرورگر. سپس خریدِ همان محصول را با هر دو وضعیت سفارش و فاکتور می‌سنجد. یکتایی دیتابیس و خطای `P2002` از ثبت دو دیدگاه جلوگیری می‌کند.

```ts
const score = reviewScore(input) // سه عدد صحیح ۱ تا ۵؛ میانگین گرد شده در سرور
if (!score) return err('Invalid rating', 400)
const purchased = await db.order.count({
  where: { userId: user.id, productId: product.id, status: 'PAID', invoice: { status: 'PAID' } },
})
if (!purchased) return err('Only verified buyers can review this product', 403)
await db.productReview.create({ data: {
  productId: product.id, userId: user.id, rating: score.rating,
  criteria: JSON.stringify(score.criteria), title, body,
} })
```

پرسش برای کاربر واردشده و مهمان باز است؛ مهمان نام ۲ تا ۸۰ کاراکتری می‌دهد. متن ساده با حد طول، محدودسازی نرخ IP/کاربر و صف تأیید مدیریت اعمال شده است. این آزادبودن به معنای نمایش فوری محتوای مهمان نیست.

## تب‌ها و تجربهٔ کاربری

`ProductTabs` هفت تب توضیحات، مشخصات، دیدگاه، پرسش، FAQ، مطالب و محصولات مرتبط دارد. محتوای هر تب در اولین انتخاب از `GET /api/products/[slug]/tabs` دریافت و در حالت صفحه ذخیره می‌شود. دیدگاه‌ها و پرسش‌ها صفحه‌بندی می‌شوند. وضعیت بارگذاری، خطا و دکمهٔ تلاش دوباره نمایش داده می‌شود؛ فرم ارسال نیز حالت درحال‌ثبت دارد.

```tsx
const [loading, setLoading] = useState(false)
const [loadError, setLoadError] = useState('')
async function fetchTab(tab: Tab, page: number) {
  setLoading(true); setLoadError('')
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(slug)}/tabs?tab=${tab}&page=${page}`, { cache: 'no-store' })
    if (!response.ok) throw Error('load failed')
    setData(old => ({ ...old, [`${tab}:${page}`]: await response.json() }))
  } catch { setLoadError('Could not load. Retry.') }
  finally { setLoading(false) }
}
```

پیاده‌سازی واقعی برای تب‌های بدون صفحه کلید ثابت و کش محلی دارد؛ این نمونه فقط چرخهٔ بارگذاری/خطا را نشان می‌دهد. `role="tablist"`، `aria-selected`، `aria-controls`، `aria-busy` و پیام `role="alert"` در کامپوننت حاضرند. محتوای HTML محصول پیش از ذخیره/ارسال پاک‌سازی می‌شود.

## مجله و کوئری‌ها

صفحهٔ `/blog` یک مطلب شاخصِ تمام‌عرض، نوار مطالب منتخب، شبکهٔ مطالب تازه، کارت‌های دسته، منتخبی سردبیری، دسته‌های درختی و جست‌وجو/صفحه‌بندی دارد. `/blog/[slug]` تصویر بزرگ، عنوان و فراداده، متن عریض با فهرست محتوای چسبان، باکس نویسنده، نوشته‌های مرتبط و نظرات را نشان می‌دهد. جهت RTL و LTR از زبان جاری می‌آید.

دریافت داده به‌صورت محدود (`take`/صفحه‌بندی)، با فیلتر `status: 'PUBLISHED'` و انتخاب دسته/نویسندهٔ لازم انجام می‌شود. برای دادهٔ پرترافیک، ایندکس وضعیت/زمان انتشار و ایندکس عضویت دسته در schema وجود دارد؛ انتشار نوشته‌ها باید با invalidation کش یا بازآفرینی صفحه همراه شود. روی صفحهٔ نوشته، مرتبط‌ها حداکثر ۶ مورد و خارج از شناسهٔ نوشتهٔ جاری‌اند.

## ظاهر و حرکت

استایل‌ها در `src/app/store-design.css` و `src/app/journal-design.css` قرار دارند. محصول در دسکتاپ سه ستونِ تصویر، اطلاعات و خرید چسبان دارد و در موبایل تک‌ستون می‌شود. تب‌ها هنگام حرکت صفحه در بالای ناحیهٔ محتوا می‌مانند. مجله از grid واکنش‌گرا، لایهٔ گرادیان روی تصویر و جابه‌جایی نرم تصویر کارت‌ها استفاده می‌کند. برای کاهش حرکت سیستم، انیمیشن گردان و افکت‌های غیرضروری غیرفعال می‌شوند.

```css
.journal-story-card img { transition: transform .35s ease; }
.journal-story-card:hover img { transform: scale(1.05); }
@media (prefers-reduced-motion: reduce) {
  .journal-story-card img { transition: none; }
}
```

تصویر پیش‌فرض اختصاصی در `public/images/journal-editorial-fallback.webp` تنها هنگام نبود کاور نوشته استفاده می‌شود. برای رسیدن به کیفیت بصری نمونه‌ها در محتوای واقعی، برای هر نوشته و محصول تصویر شاخص/گالری مناسب از مدیریت بارگذاری کنید.

## استقرار و بررسی

از ۱.۴.۴ به ۱.۴.۵، فایل‌ها را جایگزین و ایمیج برنامه را rebuild کنید. migration جدید `20260925180000_store_feedback_v145` باید پیش از سرویس‌دهی اعمال شود؛ `deploy/docker-start.sh` با `RUN_MIGRATIONS_ON_START=true` این کار را در شروع کانتینر انجام می‌دهد. از PostgreSQL پیش از ارتقا بکاپ بگیرید. `npm run check` و `npm run build` بررسی کد و ساخت را پوشش می‌دهند. در بازبینی دستی، ثبت دیدگاه بدون خرید باید ۴۰۳، پرسش مهمان باید ۲۰۱ و نمایش عمومی آن پیش از تأیید باید مخفی باشد.
