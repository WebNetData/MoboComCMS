# Currency / Rial Payment Gateway (FrenzyEx)

Customer-facing name: **درگاه پرداخت ارزی ریالی**

This provider is integrated as an Iranian card-to-card checkout using FrenzyEx v1.
The provider name and credentials stay server-side; customers see the configured
MoboComCMS gateway name.

## Required configuration

Use either the Admin > Gateways screen or environment variables:

```env
FRENZYEX_API_KEY=frx_live_...
FRENZYEX_CALLBACK_SECRET=...
FRENZYEX_BASE_URL=https://frenzy.fastsnap.info
# Only needed when products/plans are priced in USD and Admin Settings has no rate:
FRENZYEX_USD_RATE_TOMAN=158200
```

In FrenzyEx, set the public HTTPS callback URL to:

```text
https://YOUR_DOMAIN/api/payment/frenzyex/webhook
```

For USD-priced plans, set **Admin > Settings > نرخ دلار به تومان**. MoboComCMS creates
the provider invoice in whole Toman (`TMN`).

## Runtime behavior

- Payment creation is server-side only.
- `payment_method` is `standard` (card-to-card only).
- The site uses `checkout_url` first.
- Telegram uses `bot_pay_url` first, then provider fallbacks.
- `request_id`, provider amount, currency, and invoice ownership are persisted
  before settlement.
- The callback HMAC is checked over the exact raw request bytes using
  `X-Frenzy-Signature`.
- Orders are fulfilled only for `payment.completed` + `status=paid` after
  request/order/amount/currency checks.
- Callback processing is idempotent by FrenzyEx `request_id`.
- `payment.test` never fulfills a real invoice.
- Ambiguous create timeouts do not create a replacement checkout automatically;
  the local invoice stays pending to avoid duplicate customer payments.

## Go-live check

1. Configure API key, callback secret and USD/Toman rate (if needed).
2. In Admin > Gateways, enable **درگاه پرداخت ارزی ریالی**, test it, and set it
   as default when you want website and Telegram purchases to use it.
3. Run the FrenzyEx callback test and confirm it does not fulfill an invoice.
4. Run one small real card-to-card payment.
5. Confirm a resent callback does not double-credit or provision twice.
6. Confirm the subscription is provisioned and the user receives only the
   encrypted Happ link after the payment is confirmed.
