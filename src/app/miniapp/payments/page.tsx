'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import MiniAppHeading from '../MiniAppHeading'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

type Invoice = { id: number; number: string; title: string; total: number; currency: string; status: string; deliveryStatus: string; subscriptionId: number | null; paymentUrl: string; url: string; issuedAt: string }

export default function MiniAppPayments() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  async function load() {
    setLoading(true); setError(false)
    try {
      const response = await fetch('/api/my/invoices', { cache: 'no-store' })
      if (!response.ok) throw new Error('unavailable')
      setInvoices((await response.json()).invoices || [])
    } catch { setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const state = (invoice: Invoice) => invoice.status === 'PAID'
    ? invoice.deliveryStatus === 'DELIVERED' ? (fa ? 'پرداخت و تحویل انجام شد' : 'Paid and delivered') : invoice.deliveryStatus === 'RETRYING' ? (fa ? 'پرداخت شد؛ تلاش دوباره برای تحویل' : 'Paid; retrying delivery') : (fa ? 'پرداخت شد؛ در حال آماده‌سازی' : 'Paid; preparing delivery')
    : invoice.status === 'UNPAID' ? (fa ? 'در انتظار پرداخت' : 'Awaiting payment') : (fa ? 'فاکتور بسته شده' : 'Invoice closed')

  return <div>
    <MiniAppHeading icon="wallet" title={fa ? 'پرداخت‌ها و تحویل' : 'Payments and delivery'} />
    <button className="btn btn-ghost mb-4" onClick={load} disabled={loading}>{fa ? 'به‌روزرسانی وضعیت' : 'Refresh status'}</button>
    {loading && <p className="muted" role="status">{fa ? 'در حال دریافت…' : 'Loading…'}</p>}
    {error && <p className="error-text" role="alert">{fa ? 'دریافت فاکتورها انجام نشد. دوباره تلاش کنید.' : 'Could not load invoices. Please retry.'}</p>}
    {!loading && !error && invoices.length === 0 && <p className="card muted">{fa ? 'هنوز پرداختی ثبت نشده است.' : 'No payments yet.'}</p>}
    <div className="space-y-3">{invoices.map(invoice => <article className="card" key={invoice.id}>
      <div className="flex items-start justify-between gap-3"><div><strong>{invoice.title === 'Wallet top-up' && fa ? 'شارژ کیف پول' : invoice.title}</strong><div className="muted text-xs num" dir="ltr">#{invoice.number}</div></div><b className="num">{formatCurrency(invoice.total, invoice.currency, fa ? 'fa-IR' : 'en-US')}</b></div>
      <p className={invoice.status === 'PAID' && invoice.deliveryStatus === 'DELIVERED' ? 'success-text mt-3' : 'muted mt-3'} role="status">{state(invoice)}</p>
      <div className="flex gap-2 flex-wrap mt-3"><Link className="btn btn-ghost btn-sm" href={invoice.url}>{fa ? 'مشاهده فاکتور' : 'View invoice'}</Link>{invoice.status === 'UNPAID' && invoice.paymentUrl && <a className="btn btn-primary btn-sm" href={invoice.paymentUrl}>{fa ? 'ادامه پرداخت' : 'Resume payment'}</a>}{invoice.subscriptionId && <Link className="btn btn-ghost btn-sm" href={`/miniapp/subscriptions/${invoice.subscriptionId}`}>{fa ? 'مشاهده اشتراک' : 'View subscription'}</Link>}</div>
    </article>)}</div>
  </div>
}
