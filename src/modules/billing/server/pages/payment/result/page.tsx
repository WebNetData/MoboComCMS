import { checkoutPath, storedCheckoutSurface, type CheckoutSurface } from '@/modules/checkout/domain/surface'
import { redirect } from 'next/navigation'
import Link from '@/components/AppLink'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { formatAmount } from '@/shared/money/format'
import { isModuleEnabled } from '@/extensions/server/modules'
import { BASE_CURRENCY } from '@/shared/money'
import { paymentResultState, paymentResultTarget } from '@/modules/billing/domain/payment-result'
import { authEntryHref } from '@/modules/identity/domain/continuation'
import { headers } from 'next/headers'
import { invoiceStaffAccess } from '@/modules/billing/server/invoice-access'


/**
 * Landing page after a checkout. The wallet path settles instantly, so this
 * page shows the real outcome: paid (and delivered), still waiting for the
 * gateway, or failed.
 */
export default async function PaymentResultPage({
  searchParams: searchParamsPromise,
  surface = 'public',
}: {
  searchParams: Promise<{ invoice?: string; order?: string; failed?: string; reason?: string }>
  surface?: CheckoutSurface
}) {
  const searchParams = await searchParamsPromise
  const [locale, theme, session] = await Promise.all([getServerLocale(), getServerTheme(), getServerSession(authOptions)])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const navPages = await db.page
    .findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    .catch(() => [])

  const viewerId = Number((session as any)?.user?.id || 0)
  const isAdmin = (session as any)?.user?.role === 'ADMIN' && await invoiceStaffAccess(new Headers(await headers()))

  const { invoiceNumber, orderId, href: resultHref } = paymentResultTarget(searchParams)

  const invoice = invoiceNumber
    ? await db.invoice.findUnique({
        where: { number: invoiceNumber },
        include: { order: true, plan: { select: { name: true } }, product: { select: { name: true } } },
      })
    : orderId
      ? await db.invoice.findFirst({ where: { orderId }, include: { order: true, plan: { select: { name: true } }, product: { select: { name: true } } } })
      : null

  const allowed = Boolean(invoice && viewerId && (invoice.userId === viewerId || isAdmin))
  const view = allowed && invoice ? invoice : null
  if (view?.userId === viewerId && surface === 'public' && storedCheckoutSurface(view.order?.meta) === 'dashboard') redirect(checkoutPath(resultHref, 'dashboard'))

  const subscription = view?.orderId
    ? await db.subscription.findFirst({ where: { orderId: view.orderId }, select: { id: true, username: true, expiresAt: true } })
    : null

  const fulfillment = view?.orderId ? await db.fulfillmentJob.findFirst({ where: { orderId: view.orderId }, orderBy: { id: 'desc' }, select: { status: true } }) : null
  const productDelivery = view?.productId && view.orderId ? await db.productDelivery.findUnique({ where: { orderId: view.orderId }, select: { status: true } }) : null
  const topup = view?.kind === 'WALLET_TOPUP' && view.userId !== null ? await db.walletTx.findFirst({ where: { invoiceId: view.id, userId: view.userId, type: 'TOPUP', status: 'DONE' }, select: { status: true } }) : null

  const state = view ? paymentResultState(view.status, view.order?.status, searchParams.failed === '1') : 'pending'
  const paid = state === 'paid'
  const failed = state === 'failed'
  const refunded = state === 'refunded'
  const delivered = Boolean(view?.productId ? productDelivery?.status === 'DELIVERED' : subscription || fulfillment?.status === 'DONE' || (view?.kind === 'WALLET_TOPUP' && topup?.status === 'DONE') || (paid && !view?.orderId && view?.kind !== 'WALLET_TOPUP'))

  const title = !viewerId ? (isFa ? 'برای مشاهده نتیجه وارد شوید' : 'Sign in to view the result') : !view ? (isFa ? 'فاکتور در حساب شما پیدا نشد' : 'Invoice not found in your account') : refunded ? (isFa ? 'پرداخت مسترد شده است' : 'Payment refunded') : failed ? t.paymentFailedTitle : paid ? t.paymentSuccessTitle : t.paymentPendingTitle
  const body = !viewerId ? (isFa ? 'پس از ورود، وضعیت پرداخت و تحویل در فاکتور شما نمایش داده می‌شود.' : 'After signing in, your invoice will show the payment and delivery status.') : !view ? (isFa ? 'فاکتورهای حساب خود را بررسی کنید.' : 'Check your account invoices.') : refunded ? (isFa ? 'برگشت وجه این پرداخت ثبت شده است. جزئیات را در فاکتور و گردش حساب خود بررسی کنید.' : 'A refund has been recorded for this payment. Check your invoice and account transactions for details.') : failed ? (isFa ? 'پرداخت موفق ثبت نشده است. پیش از تلاش دوباره، وضعیت فاکتور و حساب بانکی خود را بررسی کنید.' : 'A successful payment has not been recorded. Check your invoice and bank account before trying again.') : paid && !delivered ? (view.productId ? isFa ? 'پرداخت تأیید شد. سفارش در صف آماده‌سازی و تحویل فروشگاه است؛ وضعیت را در فاکتور ببینید.' : 'Payment is confirmed. Your store order is awaiting fulfillment; follow its status on the invoice.' : isFa ? 'پرداخت تأیید شده است. سرویس یا اعتبار کیف پول در حال آماده‌سازی است؛ وضعیت این فاکتور را دوباره بررسی کنید.' : 'Payment is confirmed. Your service or wallet credit is still being prepared; check this invoice again.') : paid ? t.paymentSuccessBody : t.paymentPendingBody
  const icon = refunded ? '↩' : failed ? '⚠️' : paid ? '✅' : '⏳'
  // Paid content (an article or a download): straight back to the item once access is granted.
  let orderMeta: Record<string, unknown> = {}
  try { orderMeta = JSON.parse(view?.order?.meta || '{}') } catch { /* ignore */ }
  const contentPath = (orderMeta.kind === 'content' || orderMeta.kind === 'form') && typeof orderMeta.contentPath === 'string' && orderMeta.contentPath.startsWith('/') ? orderMeta.contentPath : ''

  const serviceOrder = surface === 'dashboard' && ['hosting', 'hosting-renewal', 'hosting-addon', 'domain', 'domain-renewal'].includes(String(orderMeta.kind))
  const serviceHref = serviceOrder ? (typeof orderMeta.contentPath === 'string' && /^\/dashboard\/(?:services|domains)\/[1-9]\d*$/.test(orderMeta.contentPath) ? orderMeta.contentPath : '/dashboard/services') : ''

  const money = (n: number) => formatAmount(n, view?.currency || BASE_CURRENCY, isFa ? 'fa-IR' : 'en-US')
  const fmt = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US') : '—')

  const Surface = surface === 'dashboard' ? 'section' : 'main'
  return (
    <>
      {surface === 'public' && <SiteHeader theme={theme} navPages={navPages} />}
      <Surface className="container flex justify-center py-20">
        <div className="card text-center max-w-xl w-full py-10">
          <div className="text-5xl mb-4">{icon}</div>
          <h1 className="h2">{title}</h1>
          <p className="muted mt-3 leading-7">{surface === 'dashboard' && paid ? (isFa ? 'پرداخت سفارش شما ثبت و تأیید شد. وضعیت آماده‌سازی، تحویل یا انجام درخواست را از گزینهٔ پیگیری زیر ببینید.' : 'Your order payment is confirmed. Use the tracking option below to check preparation, delivery or request progress.') : body}</p>
          {failed && searchParams.reason && <p className="error-text mt-3 leading-7" role="alert">{String(searchParams.reason).replace(/[<>]/g, '').slice(0, 240)}</p>}

          {view && (
            <div className="result-rows">
              <div className="result-row">
                <span className="muted">{t.invoice}</span>
                <span className="num" dir="ltr">{view.number}</span>
              </div>
              <div className="result-row">
                <span className="muted">{t.amount}</span>
                <span className="num">{money(view.total)}</span>
              </div>
              {view.walletApplied > 0 && (
                <div className="result-row">
                  <span className="muted">{t.walletCreditApplied}</span>
                  <span className="num success-text">−{money(view.walletApplied)}</span>
                </div>
              )}
              {view.status === 'PAID' && view.walletApplied > 0 && (
                <div className="result-row">
                  <span className="muted">{t.paidFromWallet}</span>
                  <span className="num">{money(view.walletApplied)}</span>
                </div>
              )}
              {subscription && (
                <div className="result-row">
                  <span className="muted">{t.expires}</span>
                  <span className="num">{fmt(subscription.expiresAt)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-center gap-3 mt-6 flex-wrap">
            {!viewerId && <Link href={authEntryHref('/login', resultHref)} className="btn btn-primary">{t.login}</Link>}
            {contentPath && orderMeta.kind !== 'form' && paid && delivered && <Link href={contentPath} className="btn btn-primary">{isFa ? 'مشاهده و دریافت' : 'Open your purchase'}</Link>}
            <Link href={serviceHref || (subscription ? `/dashboard/subscriptions/${subscription.id}` : orderMeta.kind === 'form' ? '/dashboard/requests' : contentPath ? '/dashboard/purchases' : '/dashboard/invoices')} className={contentPath && paid ? 'btn btn-ghost' : 'btn btn-primary'}>{serviceHref ? (isFa ? 'پیگیری و مدیریت سرویس' : 'Manage your service') : subscription ? t.viewSubscription : orderMeta.kind === 'form' ? (isFa ? 'درخواست‌های من' : 'My requests') : contentPath ? (isFa ? 'خریدهای من' : 'My purchases') : t.goToDash}</Link>
            {view && <Link href={checkoutPath(`/invoice/${view.number}`, surface)} className="btn btn-ghost">{t.viewInvoice}</Link>}
            {view?.productId && view.orderId && <Link href={`/dashboard/orders/${view.orderId}`} className="btn btn-ghost">{isFa ? 'پیگیری سفارش' : 'Track order'}</Link>}
            {view && paid && !delivered && <Link href={checkoutPath(`/payment/result?invoice=${encodeURIComponent(view.number)}`, surface)} className="btn btn-ghost">{isFa ? 'بررسی دوباره وضعیت' : 'Check status again'}</Link>}
            {view && !paid && view.status === 'UNPAID' && <Link href={checkoutPath(`/invoice/${view.number}`, surface)} className="btn btn-ghost">{failed ? t.tryAgain : isFa ? 'ادامه پرداخت' : 'Resume payment'}</Link>}
            {failed && (!view || view.status !== 'UNPAID') && <Link href={view?.kind === 'WALLET_TOPUP' ? '/dashboard/wallet' : await isModuleEnabled('vpn') ? '/plans' : '/dashboard/invoices'} className="btn btn-ghost">{t.tryAgain}</Link>}
          </div>
        </div>
      </Surface>
      {surface === 'public' && <SiteFooter navPages={navPages} />}
    </>
  )
}
