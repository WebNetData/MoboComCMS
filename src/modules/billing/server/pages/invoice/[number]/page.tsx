import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import Icon from '@/components/site/Icon'
import { formatAmount } from '@/shared/money/format'
import { invoiceSubject } from '@/modules/billing/domain/invoice-subject'
import { parseFxRates } from '@/modules/billing/domain/invoice-rules'
import { getInvoiceRules } from '@/modules/billing/server/invoice-rules'
import InvoiceDeadline from '@/components/billing/InvoiceDeadline'
import { decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import CardTransferBox from '@/components/billing/CardTransferBox'
import { IRANIAN_BANKS, formatCard, formatSheba, transferAmounts } from '@/modules/billing/domain/card-transfer'
import { invoiceDueMinor } from '@/modules/billing/server/billing'
import { minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { getBrandedInvoiceProfile } from '@/modules/billing/server/official-invoice'
import InvoiceLogo from '@/components/billing/InvoiceLogo'
import { headers } from 'next/headers'
import { invoiceStaffAccess } from '@/modules/billing/server/invoice-access'


export default async function InvoicePage({ params: paramsPromise }: { params: Promise<{ number: string }> }) {
  const params = await paramsPromise
  const [locale, theme, session, settings] = await Promise.all([
    getServerLocale(),
    getServerTheme(),
    getServerSession(authOptions),
    getSettings(),
  ])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const invoice = await db.invoice.findUnique({
    where: { number: params.number },
    include: {
      user: { select: { id: true, email: true, name: true, createdAt: true } },
      plan: { select: { name: true, trafficGB: true, days: true, deviceLimit: true } },
      product: { select: { name: true } },
      gateway: true,
      order: { select: { id: true, status: true, paymentUrl: true, provider: true, meta: true, lines: { orderBy: { line: 'asc' }, select: { name: true, variantName: true, quantity: true, totalMinor: true } } } },
      payments: { orderBy: { id: 'desc' }, take: 5 },
    },
  })
  if (!invoice) notFound()

  const viewerId = Number((session as any)?.user?.id || 0)
  const isOwner = viewerId && viewerId === invoice.userId
  const isAdmin = (session as any)?.user?.role === 'ADMIN' && await invoiceStaffAccess(new Headers(await headers()))
  if (!isOwner && !isAdmin) notFound()

  const navPages = await db.page
    .findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    .catch(() => [])

  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US') : '—'
  const money = (n: number, currency = invoice.currency) => formatAmount(n, currency, isFa ? 'fa-IR' : 'en-US')


  const due = Math.max(0, Math.round((invoice.total - (invoice.walletApplied || 0)) * 100) / 100)
  const [deliveryJob, deliveredSubscription, creditedTopup, productDelivery] = invoice.status === 'PAID' ? await Promise.all([
    invoice.orderId ? db.fulfillmentJob.findFirst({ where: { orderId: invoice.orderId }, orderBy: { id: 'desc' }, select: { status: true } }) : Promise.resolve(null),
    invoice.orderId ? db.subscription.findFirst({ where: { orderId: invoice.orderId, userId: invoice.userId }, select: { id: true } }) : Promise.resolve(null),
    invoice.kind === 'WALLET_TOPUP' ? db.walletTx.findFirst({ where: { invoiceId: invoice.id, status: 'DONE', type: 'TOPUP' }, select: { id: true } }) : Promise.resolve(null),
    invoice.productId && invoice.orderId ? db.productDelivery.findUnique({ where: { orderId: invoice.orderId }, select: { status: true, trackingCode: true, deliveryNote: true, digitalDelivery: true } }) : Promise.resolve(null),
  ]) : [null, null, null, null]
  const deliveryPending = invoice.status === 'PAID' && (invoice.kind === 'WALLET_TOPUP' ? !creditedTopup : invoice.productId ? productDelivery?.status !== 'DELIVERED' : Boolean(invoice.orderId && !deliveredSubscription && deliveryJob?.status !== 'DONE'))
  let productMeta: Record<string, unknown> = {}
  try { productMeta = JSON.parse(invoice.order?.meta || '{}') } catch {}
  const [rules, profile] = await Promise.all([getInvoiceRules(), getBrandedInvoiceProfile()])
  const subject = invoiceSubject({ kind: invoice.kind, title: invoice.title, detail: invoice.detail, planName: invoice.plan?.name, productName: invoice.product?.name, meta: productMeta, siteName: settings.brandName || 'موبوکام', amountText: money(invoice.subtotal), notes: invoice.notes })
  const itemTitle = isFa ? subject.title : invoice.plan?.name || invoice.product?.name || t.invoice
  let digitalDelivery = ''
  try { if (productDelivery?.status === 'DELIVERED') digitalDelivery = decryptDigitalDelivery(productDelivery.digitalDelivery) } catch { /* Lost encryption key: hide unreadable ciphertext. */ }
  const cardTransfer = invoice.gateway?.provider === 'CARD_TRANSFER'
  const [bankAccounts, receipts] = cardTransfer ? await Promise.all([
    db.bankAccount.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    db.paymentReceipt.findMany({ where: { invoiceId: invoice.id }, orderBy: { id: 'desc' }, take: 5 }),
  ]) : [[], []]
  const invoiceCurrency = normalizeCurrency(invoice.currency)
  const transfer = cardTransfer ? transferAmounts(invoiceDueMinor({ totalMinor: invoice.totalMinor || toMinor(invoice.total, invoiceCurrency), walletAppliedMinor: invoice.walletAppliedMinor }), invoiceCurrency) : null
  const manualInstructions = invoice.gateway?.provider === 'MANUAL' ? invoice.gateway?.instructions || '' : ''
  const hostedPayUrl =
    invoice.status === 'UNPAID' &&
    (invoice.paymentUrl || invoice.order?.paymentUrl) &&
    /^https:\/\//.test(invoice.paymentUrl || invoice.order?.paymentUrl || '') &&
    invoice.gateway?.provider !== 'MANUAL'
      ? invoice.paymentUrl || invoice.order?.paymentUrl || ''
      : ''

  return (
    <>
      <SiteHeader theme={theme} navPages={navPages} />
      <main className="container py-12 invoice-page">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6 no-print">
          <Link href="/dashboard/invoices" className="muted">← {t.myInvoices}</Link>
          {invoice.status !== 'DRAFT' && <div className="invoice-actions">
            <a href={`/api/invoices/${encodeURIComponent(invoice.number)}/pdf?download=1`} className="btn btn-primary" download><Icon name="file" size={17} /> {isFa ? 'دانلود PDF' : 'Download PDF'}</a>
            <a href={`/api/invoices/${encodeURIComponent(invoice.number)}/pdf`} className="btn btn-ghost" target="_blank" rel="noopener noreferrer"><Icon name="receipt" size={17} /> {isFa ? 'چاپ فاکتور' : 'Print invoice'}</a>
            <Link href={`/invoice/${invoice.number}/official`} className="btn btn-ghost">{isFa ? 'صورتحساب رسمی' : 'Official invoice'}</Link>
          </div>}
        </div>

        <div className="no-print"><InvoiceDeadline status={invoice.status} expiresAt={invoice.expiresAt ? invoice.expiresAt.toISOString() : null} fxRates={parseFxRates(invoice.fxRates)} jumpToman={rules.fxJumpToman} closeAction={invoice.fxRates ? rules.fxAction : rules.overdueAction} closedReason={invoice.closedReason} againHref={productMeta.kind === 'form' ? '/dashboard/requests' : invoice.productId ? '/products' : '/dashboard/invoices'} /></div>

        <div className="card invoice-sheet">
          <div className="invoice-head">
            <div className="invoice-seller">
              <InvoiceLogo src={profile.logo} name={settings.brandName || 'M'} className="invoice-mark" />
              <div>
                <div className="invoice-brand">{settings.brandName || 'MoboComCMS'}</div>
                <div className="invoice-contact">{settings.supportEmail || 'support@example.com'}{settings.siteUrl && <> · <bdi dir="ltr">{settings.siteUrl.replace(/^https?:\/\//, '')}</bdi></>}</div>
              </div>
            </div>
            <div className="invoice-id">
              <span className={`invoice-status is-${invoice.status.toLowerCase()}`}>{(t as Record<string, string>)[`st${invoice.status}`] || invoice.status}</span>
              <div className="invoice-title">{t.invoice}</div>
              <bdi className="invoice-number" dir="ltr">{invoice.number}</bdi>
            </div>
          </div>

          <div className="invoice-meta">
            <div>
              <span>{t.billedTo}</span>
              <b>{invoice.user.name || invoice.user.email}</b>
              {invoice.user.name && !/\.local$/.test(invoice.user.email) && <small dir="ltr">{invoice.user.email}</small>}
            </div>
            <div><span>{t.issuedAt}</span><b>{fmt(invoice.issuedAt)}</b></div>
            <div><span>{t.dueAt}</span><b>{fmt(invoice.dueAt)}</b></div>
            <div><span>{t.gateway}</span><b>{invoice.gateway?.name || t.manualTransfer}</b></div>
          </div>

          <div className="invoice-items">
          <table className="data invoice-table">
            <thead>
              <tr>
                <th>{t.description}</th>
                <th>{t.qty}</th>
                <th>{t.amount}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.order?.lines.length ? <>
                {invoice.order.lines.map((line, index) => <tr key={index}>
                  <td>{line.name}{line.variantName && <div className="muted text-xs">{line.variantName}</div>}</td>
                  <td className="num">{line.quantity.toLocaleString(isFa ? 'fa-IR' : 'en-US')}</td>
                  <td className="num">{money(minorToNumber(line.totalMinor, invoice.currency))}</td>
                </tr>)}
                {Number(productMeta.shippingMinor || 0) > 0 && <tr><td>{isFa ? 'هزینهٔ ارسال' : 'Shipping'}</td><td className="num">1</td><td className="num">{money(minorToNumber(BigInt(String(productMeta.shippingMinor)), invoice.currency))}</td></tr>}
              </> : <tr>
                <td>
                  {itemTitle}
                  {isFa && subject.detail && <div className="invoice-item-detail">{subject.detail}</div>}
                  {invoice.plan && (
                    <div className="muted text-xs num">
                      {invoice.plan.trafficGB} GB · {invoice.plan.days} {t.days} · {invoice.plan.deviceLimit} {t.simultaneous}
                    </div>
                  )}
                </td>
                <td className="num">1</td>
                <td className="num">{money(invoice.subtotal)}</td>
              </tr>}
            </tbody>
          </table>
          </div>

          <div className="invoice-totals">
            <div><span className="muted">{t.subtotal}</span><span className="num">{money(invoice.subtotal)}</span></div>
            {invoice.discount > 0 && <div><span className="muted">{t.discount}</span><span className="num">−{money(invoice.discount)}</span></div>}
            {invoice.tax > 0 && <div><span className="muted">{t.tax}</span><span className="num">{money(invoice.tax)}</span></div>}
            <div className="invoice-grand"><span>{t.total}</span><span className="num">{money(invoice.total)}</span></div>
            {invoice.walletApplied > 0 && (
              <div>
                <span className="muted">{t.walletCreditApplied}</span>
                <span className="num success-text">−{money(invoice.walletApplied)}</span>
              </div>
            )}
            {invoice.walletApplied > 0 && invoice.status !== 'PAID' && (
              <div><span className="muted font-semibold">{t.amountDue}</span><span className="num font-semibold">{money(due)}</span></div>
            )}
            {invoice.paidAmount > 0 && (
              <div><span className="muted">{t.paidAmount}</span><span className="num">{money(invoice.paidAmount)} {invoice.paidCrypto ? `(${invoice.paidCrypto})` : ''}</span></div>
            )}
          </div>

          {deliveryPending && <div className="card mt-4" role="status"><strong>{isFa ? 'پرداخت تأیید شد؛ تحویل در حال پیگیری است' : 'Payment confirmed; delivery is being processed'}</strong><p className="muted mt-2">{invoice.productId ? isFa ? 'سفارش شما در صف آماده‌سازی فروشگاه است. وضعیت تحویل را از همین فاکتور پیگیری کنید.' : 'Your order is in the store fulfillment queue. Track delivery here.' : isFa ? 'از فهرست فاکتورها وضعیت را دوباره بررسی کنید. اگر تحویل انجام نشود، سیستم به‌صورت خودکار دوباره تلاش می‌کند.' : 'Check the invoice list for updates. The system will retry delivery automatically if needed.'}</p></div>}
          {productDelivery && <div className="card mt-4"><strong>{isFa ? 'وضعیت تحویل محصول' : 'Product delivery'}</strong><p className="muted mt-2">{productDelivery.status === 'DELIVERED' ? isFa ? 'تحویل‌شده' : 'Delivered' : productDelivery.status === 'PROCESSING' ? isFa ? 'در حال آماده‌سازی' : 'Preparing' : isFa ? 'در انتظار تحویل' : 'Awaiting fulfillment'}</p>{productDelivery.trackingCode && <p className="num mt-2" dir="ltr">{productDelivery.trackingCode}</p>}{productDelivery.deliveryNote && <p className="mt-2">{productDelivery.deliveryNote}</p>}</div>}
          {digitalDelivery && <div className="card mt-4"><strong>{isFa ? 'اطلاعات محصول مجازی شما' : 'Your digital delivery'}</strong><pre className="store-digital-delivery" dir="auto">{digitalDelivery}</pre></div>}
          {deliveredSubscription && <Link href={`/dashboard/subscriptions/${deliveredSubscription.id}`} className="btn btn-ghost mt-4 no-print">{t.viewSubscription}</Link>}

          {invoice.status === 'UNPAID' && (
            <div className="invoice-pay no-print">
              <h3 className="font-bold mb-2">{invoice.walletApplied > 0 ? t.payRemaining : t.howToPay}</h3>
              {invoice.walletApplied > 0 && (
                <p className="muted mb-3">
                  {t.walletCreditApplied}: {money(invoice.walletApplied)} · {t.amountDue}: <strong className="num">{money(due)}</strong>
                </p>
              )}
              {hostedPayUrl && (
                <a href={hostedPayUrl} className="btn btn-primary mb-3">{invoice.gateway?.provider === 'FRENZYEX' ? (isFa ? 'پرداخت با درگاه پرداخت ارزی ریالی' : 'Pay via Currency / Rial Gateway') : t.payWithCrypto} →</a>
              )}
              {cardTransfer && transfer && bankAccounts.length > 0 && (
                <CardTransferBox
                  invoiceNumber={invoice.number}
                  rial={transfer.rial.toLocaleString('fa-IR')}
                  toman={transfer.toman.toLocaleString('fa-IR')}
                  banks={IRANIAN_BANKS}
                  accounts={bankAccounts.map((account) => ({ id: account.id, bankName: account.bankName, holderName: account.holderName, card: account.cardNumber ? formatCard(account.cardNumber) : '', sheba: account.sheba ? formatSheba(account.sheba) : '', accountNumber: account.accountNumber, note: account.note }))}
                  receipts={receipts.map((receipt) => ({ id: receipt.id, status: receipt.status, trackingCode: receipt.trackingCode, payerBank: receipt.payerBank, payerName: receipt.payerName, createdAt: receipt.createdAt.toISOString(), adminNote: receipt.adminNote }))}
                />
              )}
              {manualInstructions && (
                <pre className="manual-instructions" dir="ltr">{manualInstructions}</pre>
              )}
              {!hostedPayUrl && !manualInstructions && !(cardTransfer && transfer && bankAccounts.length) && <p className="muted">{t.contactSupportForPayment}</p>}
              {!cardTransfer && <p className="muted mt-3">{t.invoiceUnpaidHint}</p>}
            </div>
          )}

          {invoice.notes && <p className="muted mt-4">{invoice.notes}</p>}

          <div className="invoice-foot muted text-xs">
            <span>{t.thankYouPurchase}</span>
            <span className="num" dir="ltr">{invoice.number}</span>
          </div>
        </div>

        {isAdmin && (
          <div className="card mt-6 no-print">
            <h3 className="font-bold mb-3">{t.paymentHistory}</h3>
            {invoice.payments.length === 0 && <p className="muted">—</p>}
            <table className="data">
              <thead>
                <tr><th>#</th><th>{t.provider}</th><th>{t.status}</th><th>{t.amount}</th><th>{t.date}</th></tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="num">{p.id}</td>
                    <td>{p.provider}</td>
                    <td>{p.status}</td>
                    <td className="num">{money(p.amount, p.currency)}</td>
                    <td className="num">{fmt(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link href="/admin/invoices" className="btn btn-ghost mt-4">{t.invoicesAdmin}</Link>
          </div>
        )}
      </main>
      <SiteFooter navPages={navPages} />
    </>
  )
}
