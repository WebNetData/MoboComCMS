'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

export default function AdminDashboard() {
  const { t, locale } = useI18n()
  const vpnOn = useModuleEnabled('vpn')
  const isFa = locale === 'fa'
  const [data, setData] = useState<any>(null)
  const [fin, setFin] = useState<any>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [statsRes, finRes] = await Promise.all([fetch('/api/admin/stats'), fetch('/api/admin/finance?months=6')])
      if (statsRes.ok) setData(await statsRes.json())
      else setFailed(true)
      if (finRes.ok) setFin(await finRes.json())
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const money = (n: number, currency = fin?.currency || 'USD') => formatCurrency(n, currency, isFa ? 'fa-IR' : 'en-US')
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US')

  if (failed) {
    return (
      <div className="card admin-load-error">
        <p>{isFa ? 'خطا در دریافت آمار داشبورد.' : 'Failed to load dashboard stats.'}</p>
        <button type="button" className="btn btn-primary" onClick={() => load()}>
          {isFa ? 'تلاش مجدد' : 'Retry'}
        </button>
      </div>
    )
  }

  if (!data) return <p className="muted">{t.loading}</p>

  const s = data.stats
  const unpaid = fin ? fin.summary.unpaidAmount : 0
  const attention = [
    { label: isFa ? 'سفارش‌های معلق' : 'Pending orders', count: s.pendingOrders, value: String(s.pendingOrders), href: '/admin/orders?status=PENDING' },
    { label: isFa ? 'تیکت‌های باز' : 'Open tickets', count: s.openTickets, value: String(s.openTickets), href: '/admin/tickets' },
    { label: isFa ? 'اشتراک رو به انقضا (۷ روز)' : 'Expiring subscriptions (7 days)', count: s.expiringSoon || 0, value: String(s.expiringSoon || 0), href: '/admin/subscriptions' },
    ...(fin ? [{ label: isFa ? 'مبلغ پرداخت‌نشده' : 'Unpaid amount', count: unpaid, value: money(unpaid, fin.currency), href: '/admin/invoices' }] : []),
  ].filter(item => item.count > 0)

  const cards: [string, string, string, string][] = [
    [t.revenue, fin ? money(fin.summary.gross, fin.currency) : '—', '💰', 'kpi-green'],
    [t.unpaidAmount, fin ? money(fin.summary.unpaidAmount, fin.currency) : '—', '📄', unpaid ? 'kpi-amber' : ''],
    [t.pendingOrders, String(s.pendingOrders), '⏳', s.pendingOrders ? 'kpi-amber' : ''],
    [t.openTickets, String(s.openTickets), '🎫', s.openTickets ? 'kpi-red' : ''],
    [t.customersCount, String(s.users), '👥', ''],
    // VPN subscriptions only matter while the VPN module is on; otherwise show total orders.
    vpnOn ? [t.activeSubs, String(s.activeSubs), '🔗', ''] : [locale === 'fa' ? 'کل سفارش‌ها' : 'All orders', String(s.orders ?? 0), '🛍️', ''],
  ]

  const maxMonth = fin ? Math.max(1, ...fin.byMonth.map((m: any) => Math.max(m.revenue, m.expenses))) : 1

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">{t.dashboard}</h1>
          <p className="muted">{isFa ? 'نمای کلی کسب‌وکار: فروش، سفارش‌ها و پشتیبانی' : 'Business at a glance: sales, orders and support'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            {isFa ? 'مشاهده سایت ↗' : 'View site ↗'}
          </Link>
          <Link href="/admin/invoices" className="btn btn-primary">{t.addInvoice}</Link>
        </div>
      </div>

      <section className="card admin-attention mb-8" aria-label={isFa ? 'نیازمند توجه' : 'Needs attention'}>
        <div className="admin-attention-head">
          <h2 className="font-bold">{isFa ? 'نیازمند توجه' : 'Needs attention'}</h2>
          <span className="muted text-xs">
            {attention.length
              ? (isFa ? `${attention.length} مورد برای بررسی` : `${attention.length} item${attention.length > 1 ? 's' : ''} to review`)
              : (isFa ? 'در حال بررسی' : 'All clear')}
          </span>
        </div>
        {attention.length === 0 ? (
          <p className="admin-attention-empty">{isFa ? 'همه‌چیز مرتب است — موردی برای بررسی نیست.' : 'Everything looks tidy — nothing needs your attention.'}</p>
        ) : (
          <div className="admin-attention-rows">
            {attention.map(item => (
              <Link key={item.href + item.label} href={item.href} className="admin-attention-row">
                <span className="admin-attention-dot" aria-hidden="true" />
                <span className="admin-attention-label">{item.label}</span>
                <span className="admin-attention-value num">{item.value}</span>
                <svg className="admin-attention-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid-3 mb-8">
        {cards.map(([label, value, icon, cls]) => (
          <div key={label} className={`card kpi ${cls}`}>
            <div className="kpi-icon">{icon}</div>
            <div className="min-w-0">
              <div className="muted text-xs">{label}</div>
              <div className="num text-2xl font-extrabold truncate">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="grid mb-6"
        style={{ gridTemplateColumns: fin ? 'minmax(0,1.6fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: '1rem' }}
      >
        {fin && (
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h3 className="font-bold">{t.monthlyRevenue}</h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-2"><i className="dot dot-primary" /> {t.revenue}</span>
                <span className="flex items-center gap-2"><i className="dot dot-danger" /> {t.expenses}</span>
              </div>
            </div>
            <div className="chart">
              {fin.byMonth.map((m: any) => (
                <div key={m.month} className="chart-col" title={`${m.month}: ${money(m.revenue, fin.currency)}`}>
                  <div className="chart-bars">
                    <div className="chart-bar bar-primary" style={{ height: `${Math.max(2, (m.revenue / maxMonth) * 100)}%` }} />
                    <div className="chart-bar bar-danger" style={{ height: `${Math.max(1, (m.expenses / maxMonth) * 100)}%` }} />
                  </div>
                  <div className="chart-label num">{m.month.slice(5)}</div>
                </div>
              ))}
            </div>
            <div className="stat-strip mt-6">
              <div className="mini-stat">
                <div className="muted text-xs">{t.grossRevenue}</div>
                <div className="mini-stat-value num">{money(fin.summary.gross, fin.currency)}</div>
              </div>
              <div className="mini-stat">
                <div className="muted text-xs">{t.netProfit}</div>
                <div className="mini-stat-value num">{money(fin.summary.net, fin.currency)}</div>
              </div>
              <div className="mini-stat">
                <div className="muted text-xs">{t.avgOrderValue}</div>
                <div className="mini-stat-value num">{money(fin.summary.avgOrder, fin.currency)}</div>
              </div>
              <div className="mini-stat">
                <div className="muted text-xs">{t.paymentsCount}</div>
                <div className="mini-stat-value num">{fin.summary.payments}</div>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t.openTickets}</h3>
            <Link href="/admin/tickets" className="muted text-xs">{t.viewAll} →</Link>
          </div>
          <div className="flex flex-col gap-3">
            {data.openTickets.length === 0 && <p className="muted">✨ {t.noTickets}</p>}
            {data.openTickets.map((tk: any) => (
              <Link key={tk.id} href="/admin/tickets" className="block rounded-lg border border-var p-3 card-hover">
                <div className="text-sm font-semibold"><span className="num">#{tk.id}</span> {tk.subject}</div>
                <div className="muted mt-1 text-xs" dir="ltr">{tk.user}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{t.recentOrders}</h3>
          <Link href="/admin/orders" className="muted text-xs">{t.viewAll} →</Link>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>{t.customer}</th>
              <th>{t.plan}</th>
              <th>{t.amount}</th>
              <th>{t.status}</th>
              <th>{t.date}</th>
            </tr>
          </thead>
          <tbody>
            {data.recentOrders.map((o: any) => (
              <tr key={o.id}>
                <td className="num">{o.id}</td>
                <td dir="ltr">{o.user}</td>
                <td>{o.plan}</td>
                <td className="num font-semibold">{money(o.amount, o.currency)}</td>
                <td><StatusBadge value={o.status} /></td>
                <td className="num">{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
