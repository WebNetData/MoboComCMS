import Link from '@/components/AppLink'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { formatAmount } from '@/shared/money/format'


/**
 * Landing page after a checkout. The wallet path settles instantly, so this
 * page shows the real outcome: paid (and delivered), still waiting for the
 * gateway, or failed.
 */
export default async function PaymentResultPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ invoice?: string; order?: string; failed?: string }>
}) {
  const searchParams = await searchParamsPromise
  const [locale, theme, session] = await Promise.all([getServerLocale(), getServerTheme(), getServerSession(authOptions)])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const navPages = await db.page
    .findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    .catch(() => [])

  const viewerId = Number((session as any)?.user?.id || 0)
  const isAdmin = (session as any)?.user?.role === 'ADMIN'

  const invoiceNumber = String(searchParams.invoice || '')
  const orderId = Number(searchParams.order) || 0

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

  const subscription = view?.orderId
    ? await db.subscription.findFirst({ where: { orderId: view.orderId }, select: { id: true, username: true, expiresAt: true } })
    : null

  const fulfillment = view?.orderId ? await db.fulfillmentJob.findFirst({ where: { orderId: view.orderId }, orderBy: { id: 'desc' }, select: { status: true } }) : null
  const productDelivery = view?.productId && view.orderId ? await db.productDelivery.findUnique({ where: { orderId: view.orderId }, select: { status: true } }) : null
  const topup = view?.kind === 'WALLET_TOPUP' ? await db.walletTx.findFirst({ where: { invoiceId: view.id, userId: viewerId }, orderBy: { id: 'desc' }, select: { status: true } }) : null

  const paid = view?.status === 'PAID' || view?.order?.status === 'PAID'
  const failed = !paid && (searchParams.failed === '1' || view?.status === 'VOID' || view?.order?.status === 'FAILED')
  const delivered = Boolean(view?.productId ? productDelivery?.status === 'DELIVERED' : subscription || fulfillment?.status === 'DONE' || (view?.kind === 'WALLET_TOPUP' && topup?.status === 'DONE') || (paid && !view?.orderId && view?.kind !== 'WALLET_TOPUP'))

  const title = !viewerId ? (isFa ? 'برای مشاهده نتیجه وارد شوید' : 'Sign in to view the result') : !view ? (isFa ? 'فاکتور در حساب شما پیدا نشد' : 'Invoice not found in your account') : failed ? t.paymentFailedTitle : paid ? t.paymentSuccessTitle : t.paymentPendingTitle
  const body = !viewerId ? (isFa ? 'پس از ورود، وضعیت پرداخت و تحویل در فاکتور شما نمایش داده می‌شود.' : 'After signing in, your invoice will show the payment and delivery status.') : !view ? (isFa ? 'فاکتورهای حساب خود را بررسی کنید.' : 'Check your account invoices.') : failed ? t.paymentFailedBody : paid && !delivered ? (view.productId ? isFa ? 'پرداخت تأیید شد. سفارش در صف آماده‌سازی و تحویل فروشگاه است؛ وضعیت را در فاکتور ببینید.' : 'Payment is confirmed. Your store order is awaiting fulfillment; follow its status on the invoice.' : isFa ? 'پرداخت تأیید شده است. سرویس یا اعتبار کیف پول در حال آماده‌سازی است؛ وضعیت این فاکتور را دوباره بررسی کنید.' : 'Payment is confirmed. Your service or wallet credit is still being prepared; check this invoice again.') : paid ? t.paymentSuccessBody : t.paymentPendingBody
  const icon = failed ? '⚠️' : paid ? '✅' : '⏳'

  const money = (n: number) => formatAmount(n, view?.currency || 'USD', isFa ? 'fa-IR' : 'en-US')
  const fmt = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US') : '—')

  return (
    <>
      <SiteHeader theme={theme} navPages={navPages} />
      <main className="container flex justify-center py-20">
        <div className="card text-center max-w-xl w-full py-10">
          <div className="text-5xl mb-4">{icon}</div>
          <h1 className="h2">{title}</h1>
          <p className="muted mt-3 leading-7">{body}</p>

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
            {!viewerId && <Link href={`/login?next=${encodeURIComponent(`/payment/result?invoice=${invoiceNumber}`)}`} className="btn btn-primary">{t.login}</Link>}
            <Link href={subscription ? `/dashboard/subscriptions/${subscription.id}` : '/dashboard/invoices'} className="btn btn-primary">{subscription ? t.viewSubscription : t.goToDash}</Link>
            {view && <Link href={`/invoice/${view.number}`} className="btn btn-ghost">{t.viewInvoice}</Link>}
            {view && paid && !delivered && <Link href={`/payment/result?invoice=${encodeURIComponent(view.number)}`} className="btn btn-ghost">{isFa ? 'بررسی دوباره وضعیت' : 'Check status again'}</Link>}
            {view && !paid && view.status === 'UNPAID' && <Link href={`/invoice/${view.number}`} className="btn btn-ghost">{isFa ? 'ادامه پرداخت' : 'Resume payment'}</Link>}
            {failed && <Link href={view?.kind === 'WALLET_TOPUP' ? '/dashboard/wallet' : '/plans'} className="btn btn-ghost">{t.tryAgain}</Link>}
          </div>
        </div>
      </main>
      <SiteFooter navPages={navPages} />
    </>
  )
}
