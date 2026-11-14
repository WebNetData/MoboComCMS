import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import CartCheckout from '@/components/store/CartCheckout'
import { quotationByToken, quotationPreview } from '@/modules/store/server/quotations'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { getViewer } from '@/modules/membership/server/membership'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { deliverySchedule } from '@/modules/shipping/server/shipping'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { orderPauseMessage } from '@/modules/store/server/order-acceptance'
import { formatMoney } from '@/shared/money'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { getServerTheme } from '@/i18n/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پیش‌فاکتور خرید', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function QuotationPage({ params }: { params: Promise<{ token: string }> }) {
  if (!await isStoreEnabled()) notFound()
  if (!(await rateLimitStrict(`quotation-view:${clientIp(await headers())}`, 80, 60_000)).ok) return <main className="container content-surface"><p role="status">کمی بعد دوباره تلاش کنید.</p></main>
  const { token } = await params
  const row = await quotationByToken(token)
  if (!row) notFound()
  const [preview, viewer, theme] = await Promise.all([quotationPreview(token), getViewer(), getServerTheme()])
  if (!preview) notFound()
  const owns = viewer.userId === row.userId
  const [schedule, gateways, settings] = owns && preview.available && preview.cart ? await Promise.all([deliverySchedule(), checkoutGatewayOptions(preview.currency), getStoreSettings()]) : [null, [], null]
  const money = (value: string) => formatMoney(BigInt(value), preview.currency, 'fa-IR')
  return <><SiteHeader theme={theme} /><main className="container content-surface sh-checkout-page" dir="rtl">
    <section className="sh-panel" aria-labelledby="quotation-title">
      <h1 id="quotation-title">{preview.title}</h1>
      <p>شمارهٔ پیشنهاد: {preview.id.toLocaleString('fa-IR')} · اعتبار تا {new Date(preview.expiresAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}</p>
      <p>این پیشنهاد تا پذیرش و ثبت سفارش، موجودی رزرو نمی‌کند. هزینهٔ ارسال هنگام انتخاب نشانی مشخص می‌شود.</p>
      <ul>{preview.quotedLines.map((line, index) => <li key={`${line.productId}:${line.variantId || 0}`}>{line.name || `کالای ${(index + 1).toLocaleString('fa-IR')}`}{line.variantName ? ` · ${line.variantName}` : ''} · {line.quantity.toLocaleString('fa-IR')} عدد · قیمت ثبت‌شدهٔ هر عدد {money(line.unitMinor || '0')}</li>)}</ul>
      <p>جمع اولیهٔ کالاها: {money(preview.originalSubtotalMinor)} · تخفیف فروشنده: {money(preview.discountMinor)}</p>
      {preview.changed && <p role="status">قیمت کالاها از زمان تهیهٔ پیشنهاد تغییر کرده است. مبلغ فعلی در خلاصهٔ پرداخت نمایش داده می‌شود؛ پیش از ادامه دوباره آن را تأیید کنید.</p>}
      {!preview.available && <p role="status">{preview.reason}</p>}
      {!owns && preview.available && <p><Link href={`/login?next=${encodeURIComponent(`/quote/${token}`)}`}>ورود به حساب مشتری برای پرداخت</Link> · برای مراجعهٔ حضوری، شمارهٔ پیشنهاد را به فروشنده بدهید.</p>}
      {owns && row.orderId && <Link href={`/dashboard/orders/${row.orderId}`}>مشاهدهٔ سفارش متصل</Link>}
    </section>
    {owns && preview.cart && schedule && settings && <CartCheckout quotation={{ token, fingerprint: preview.fingerprint }} cart={preview.cart} orderPauseNotice={orderPauseMessage(settings)} delivery={{ enabled: schedule.settings.enabled, days: schedule.days, pickup: schedule.settings.pickup }} gateways={gateways} />}
  </main><SiteFooter /></>
}
