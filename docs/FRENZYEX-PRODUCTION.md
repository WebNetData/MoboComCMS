# FrenzyEx / درگاه پرداخت ارزی ریالی — Production Guide

این integration برای checkout کارت‌به‌کارت (`payment_method=standard`) از API v1 استفاده می‌کند. مبلغ provider با `TMN` ساخته می‌شود و `request_id` همان شناسه عملیاتی reconciliation و idempotency callback است.

## تنظیمات

```env
FRENZYEX_API_KEY=frx_live_...
FRENZYEX_CALLBACK_SECRET=...
FRENZYEX_BASE_URL=https://frenzy.fastsnap.info
FRENZYEX_USD_RATE_TOMAN=
INTERNAL_JOBS_SECRET=<long-random-secret>
```

اگر Gateway از پنل ادمین ساخته شده باشد، credential همان رکورد در اولویت است. کلیدها را در JavaScript مرورگر، URL، Telegram button، screenshot یا log قرار ندهید.

Callback production:

```text
https://YOUR_DOMAIN/api/payment/frenzyex/webhook
```

## رفتار مالی

- ساخت checkout با `POST /api/v1/payment-requests` انجام می‌شود.
- بعد از timeout مبهم، create به شکل کور retry نمی‌شود؛ چون v1 idempotency-key ندارد و ممکن است checkout دوم ساخته شود.
- fulfillment فقط بعد از HMAC معتبر + `payment.completed` + `status=paid` + تطبیق `request_id`/`order_ref`/amount/currency انجام می‌شود.
- callback تکراری با `request_id` دوباره پول/اشتراک ایجاد نمی‌کند.
- worker با authenticated GET وضعیت requestهای pending را بازیابی می‌کند.
- `expired`/`canceled` باعث VOID شدن فاکتور، آزادشدن reservation و برگشت wallet credit رزروشده می‌شود.
- اگر provider هنوز `pending` باشد ولی `expires_at` گذشته باشد، cancel کنترل‌شده انجام می‌شود؛ 409 با GET دوباره reconcile می‌شود.

## Worker

حداقل هر یک دقیقه:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $INTERNAL_JOBS_SECRET" \
  "https://YOUR_DOMAIN/api/internal/fulfillment/run?limit=50"
```

خروجی `payments.failed` و `payments.untracked` را alert کنید. `untracked` معمولاً یعنی create پاسخ مبهم داشته و `request_id` محلی در دسترس نیست؛ آن مورد باید با merchant panel بررسی شود و نباید خودکار checkout تازه ساخت.

## Acceptance test قبل از Go-Live

1. Connection test درگاه از ادمین باید موفق باشد.
2. `payment.test` به callback برسد و هیچ invoice/order را Paid نکند.
3. یک پرداخت کارت‌به‌کارت کم‌مبلغ انجام دهید؛ invoice باید دقیقاً یک بار Paid شود.
4. همان callback را resend کنید؛ wallet/order/subscription نباید دوباره ساخته یا شارژ شود.
5. callback را موقتاً delayed کنید و worker را اجرا کنید؛ authenticated status polling باید پرداخت را settle کند.
6. یک checkout را تا expiry رها کنید؛ worker باید terminal state را ثبت و منابع رزروشده را آزاد کند.
7. در سایت و Telegram خرید را جداگانه تست کنید. پس از provisioning فقط لینک encrypted `happ://crypt5/...` باید به کاربر برسد.
8. log/audit را بررسی کنید و مطمئن شوید API key، callback secret و raw panel subscription URL در customer-visible output وجود ندارند.
