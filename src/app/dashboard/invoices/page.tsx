'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { CLOSE_REASON_LABEL } from '@/modules/billing/domain/invoice-rules'
import { BASE_CURRENCY, formatCurrency } from '@/shared/money/client'

interface Invoice {
  id: number; number: string; title: string; detail?: string; expiresAt?: string | null; closedReason?: string; kind: string
  total: number; currency: string; status: string; paidAt: string | null; issuedAt: string; dueAt: string | null
  url: string; paymentUrl: string; deliveryStatus: string; subscriptionId: number | null
}
type Totals = { currency: string; paid: number; unpaid: number }

const FILTERS = [['', 'همه'], ['UNPAID', 'پرداخت‌نشده'], ['PAID', 'پرداخت‌شده'], ['VOID', 'باطل‌شده'], ['REFUNDED', 'بازپرداخت']] as const
const STATUS: Record<string, [string, string]> = { UNPAID: ['پرداخت‌نشده', 'is-warn'], PAID: ['پرداخت‌شده', 'is-ok'], VOID: ['باطل‌شده', 'is-off'], REFUNDED: ['بازپرداخت', 'is-info'], DRAFT: ['پیش‌نویس', 'is-off'] }
const PAGE = 20
const fa = (n: number) => n.toLocaleString('fa-IR')
const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric' })
const untilFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
const money = (n: number, currency: string) => formatCurrency(n, currency, 'fa-IR')
/** Amounts per currency, the site's own first; nothing when all are zero. */
const amounts = (totals: Totals[], field: 'paid' | 'unpaid') => totals.filter((x) => x[field] > 0).sort((a, b) => (a.currency === BASE_CURRENCY ? -1 : b.currency === BASE_CURRENCY ? 1 : 0)).map((x) => money(x[field], x.currency))
const deliveryLabel = (value: string) => (value === 'DELIVERED' ? 'تحویل داده شد' : value === 'RETRYING' ? 'تحویل در حال تلاش دوباره' : 'در حال آماده‌سازی تحویل')

/** The member's invoices: what each is for, what is due, and the one thing to do next. */
export default function CustomerInvoicesPage() {
  const vpnOn = useModuleEnabled('vpn')
  const [rows, setRows] = useState<Invoice[]>([])
  const [totals, setTotals] = useState<Totals[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // A link may ask for one status (?status=UNPAID, from the account home).
  useEffect(() => { const wanted = new URLSearchParams(window.location.search).get('status') || ''; if (FILTERS.some(([id]) => id === wanted)) setStatus(wanted) }, [])

  useEffect(() => {
    let live = true
    fetch('/api/my/invoices', { cache: 'no-store' })
      .then(async (response) => {
        const data = response.ok ? await response.json().catch(() => null) : null
        if (!live) return
        if (!data) { setFailed(true); return }
        setRows(data.invoices || []); setTotals(data.totalsByCurrency || [])
      })
      .catch(() => { if (live) setFailed(true) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [loadAttempt])

  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc }, {}), [rows])
  const filtered = status ? rows.filter((row) => row.status === status) : rows
  const unpaidAmounts = amounts(totals, 'unpaid'), paidAmounts = amounts(totals, 'paid')
  const pick = (value: string) => { setStatus(value); setShown(PAGE); window.history.replaceState(null, '', value ? `?status=${value}` : window.location.pathname) }

  return <div className="dt-page" dir="rtl">
    <header className="dt-head">
      <div><h1>فاکتورهای من</h1><p>هر فاکتور، اینکه برای چیست و قدم بعدی آن؛ پرداخت، مشاهده یا دریافت PDF.</p></div>
      {vpnOn && <Link href="/plans" className="btn btn-primary"><Icon name="plus" size={16} /> خرید پلن</Link>}
    </header>

    <div className="dt-tiles">
      <button type="button" className={`dt-tile is-warn${status === 'UNPAID' ? ' is-on' : ''}`} onClick={() => pick('UNPAID')}>
        <span className="dt-tile-icon"><Icon name="clock" size={18} /></span><small>در انتظار پرداخت</small><b className="num">{fa(counts.UNPAID || 0)}</b><em>{unpaidAmounts.join(' · ') || 'بدهی ندارید'}</em>
      </button>
      <button type="button" className={`dt-tile is-ok${status === 'PAID' ? ' is-on' : ''}`} onClick={() => pick('PAID')}>
        <span className="dt-tile-icon"><Icon name="check" size={18} /></span><small>پرداخت‌شده</small><b className="num">{fa(counts.PAID || 0)}</b><em>{paidAmounts.join(' · ') || '—'}</em>
      </button>
      <button type="button" className={`dt-tile${status === '' ? ' is-on' : ''}`} onClick={() => pick('')}>
        <span className="dt-tile-icon"><Icon name="receipt" size={18} /></span><small>همهٔ فاکتورها</small><b className="num">{fa(rows.length)}</b><em>از ابتدای عضویت</em>
      </button>
    </div>

    <nav className="dt-chips" aria-label="وضعیت فاکتور">
      {FILTERS.map(([id, label]) => <button key={id || 'all'} type="button" aria-pressed={status === id} className={status === id ? 'is-on' : ''} onClick={() => pick(id)}>{label}{id && counts[id] ? <i>{fa(counts[id])}</i> : null}</button>)}
    </nav>

    {loading ? <div className="dt-skeleton" role="status" aria-label="در حال دریافت فاکتورها" aria-busy="true"><i /><i /><i /></div>
      : failed ? <div className="dt-empty is-bad" role="alert"><Icon name="receipt" size={28} /><b>فهرست فاکتورها دریافت نشد</b><span>اتصال را بررسی کنید و دوباره تلاش کنید.</span><button type="button" className="btn btn-ghost" onClick={() => { setFailed(false); setLoading(true); setLoadAttempt(attempt => attempt + 1) }}>تلاش دوباره</button></div>
      : !filtered.length ? <div className="dt-empty"><Icon name="receipt" size={30} /><b>{status ? 'فاکتوری با این وضعیت ندارید' : 'هنوز فاکتوری ندارید'}</b><span>{status === 'UNPAID' ? 'همهٔ فاکتورهایتان پرداخت شده‌اند.' : 'فاکتور هر خرید یا شارژ کیف پول این‌جا می‌آید.'}</span></div>
      : <>
        <ul className="dt-list">{filtered.slice(0, shown).map((invoice) => {
          const [label, tone] = STATUS[invoice.status] || [invoice.status, '']
          const due = invoice.status === 'UNPAID'
          return <li key={invoice.id} className={`dt-row${due ? ' is-due' : ''}`}>
            <span className={`dt-row-icon ${tone}`} aria-hidden="true"><Icon name={invoice.kind === 'WALLET_TOPUP' ? 'wallet' : 'receipt'} size={18} /></span>
            <div className="dt-row-main">
              <Link href={invoice.url} className="dt-row-title">{invoice.title}</Link>
              {invoice.detail && <p className="dt-row-detail">{invoice.detail}</p>}
              <small><bdi dir="ltr">{invoice.number}</bdi> · {dayFormat.format(new Date(invoice.issuedAt))}{due && invoice.dueAt ? ` · سررسید ${dayFormat.format(new Date(invoice.dueAt))}` : ''}{invoice.status === 'PAID' && invoice.kind !== 'WALLET_TOPUP' && invoice.deliveryStatus ? ` · ${deliveryLabel(invoice.deliveryStatus)}` : ''}</small>
              {(invoice.expiresAt || invoice.closedReason) && <span className="dt-row-tags">
                {invoice.expiresAt && <i className="dt-tag is-time">تا {untilFormat.format(new Date(invoice.expiresAt))} فعال است</i>}
                {invoice.closedReason && <i className="dt-tag is-bad">بسته‌شده: {CLOSE_REASON_LABEL[invoice.closedReason] || 'قانون خودکار'}</i>}
              </span>}
            </div>
            <div className="dt-row-end">
              <b className="num">{money(invoice.total, invoice.currency)}</b>
              <span className={`dt-state ${tone}`}>{label}</span>
              <div className="dt-row-actions">
                {due ? <Link href={invoice.url} className="btn btn-primary btn-sm">پرداخت</Link> : <Link href={invoice.url} className="btn btn-ghost btn-sm">مشاهده</Link>}
                {invoice.subscriptionId && <Link href={`/dashboard/subscriptions/${invoice.subscriptionId}`} className="btn btn-ghost btn-sm">اشتراک</Link>}
              </div>
            </div>
          </li>
        })}</ul>
        {filtered.length > shown && <button type="button" className="dt-more" onClick={() => setShown((count) => count + PAGE)}>نمایش {fa(Math.min(PAGE, filtered.length - shown))} فاکتور دیگر <small>({fa(filtered.length - shown)} باقی‌مانده)</small></button>}
      </>}
  </div>
}
