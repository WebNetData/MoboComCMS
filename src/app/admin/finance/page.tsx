'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency, BASE_CURRENCY, currencyLabel } from '@/shared/money/client'

export default function AdminFinancePage() {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [data, setData] = useState<any>(null)
  const [months, setMonths] = useState(12)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ months: String(months) })
    if (currency) qs.set('currency', currency)
    const res = await fetch(`/api/admin/finance?${qs}`).catch(() => null)
    const body = res?.ok ? await res.json().catch(() => null) : null
    if (body) setData(body)
    setLoading(false)
  }, [months, currency])

  useEffect(() => {
    load()
  }, [load])

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US')
  // Counts in the reader's digits; a finance bucket (YYYY-MM, Gregorian) named by its month.
  const num = (value: number | undefined) => (value ?? 0).toLocaleString(isFa ? 'fa-IR' : 'en-US')
  const monthName = (bucket: string) => new Intl.DateTimeFormat(isFa ? 'fa-IR-u-ca-gregory' : 'en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(`${bucket}-15T00:00:00Z`))
  const activeCurrency = data?.currency || currency || BASE_CURRENCY
  const money = (n: number) => formatCurrency(n || 0, activeCurrency, isFa ? 'fa-IR' : 'en-US')

  if (loading && !data) return <p className="muted">{t.loading}</p>
  if (!data) return <p className="muted">{t.errGeneric}</p>

  const s = data.summary
  const maxRevenue = Math.max(1, ...data.byMonth.map((m: any) => Math.max(m.revenue, m.expenses)))
  const maxGateway = Math.max(1, ...data.byGateway.map((g: any) => g.amount))
  const maxPlan = Math.max(1, ...data.byPlan.map((p: any) => p.amount))

  const kpis: [string, string, string, string?][] = [
    [t.grossRevenue, money(s.gross), '💰', 'kpi-green'],
    [t.netProfit, money(s.net), '📈', s.net >= 0 ? 'kpi-green' : 'kpi-red'],
    [t.totalExpenses, money(s.expenses), '🧮'],
    [t.unpaidAmount, money(s.unpaidAmount), '⏳', s.unpaidAmount > 0 ? 'kpi-amber' : undefined],
    [t.refunds, money(s.refunded), '↩️'],
    [t.gatewayFees, money(s.fees), '🏦'],
    [t.avgOrderValue, money(s.avgOrder), '🎯'],
    [t.paymentsCount, num(s.payments), '💳'],
  ]

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="h2">{t.financeAdmin}</h1>
          <p className="muted">{t.financeHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="select imp-w-24" aria-label={locale === 'fa' ? 'بازهٔ گزارش (ماه)' : 'Report period (months)'} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>{num(m)} {t.months}</option>
            ))}
          </select>
          <select className="select admin-currency" value={activeCurrency} onChange={(e) => setCurrency(e.target.value)} aria-label={t.currency}>
            {(data?.currencies || [activeCurrency]).map((c: string) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
          </select>
          <Link href="/admin/invoices" className="btn btn-ghost">{t.invoicesAdmin}</Link>
          <Link href="/admin/gateways" className="btn btn-primary">{t.gatewaysAdmin}</Link>
        </div>
      </div>

      <div className="grid-4 mb-8">
        {kpis.map(([label, value, icon, cls]) => (
          <div key={label} className={`card kpi ${cls || ''}`}>
            <div className="kpi-icon">{icon}</div>
            <div className="min-w-0">
              <div className="muted text-xs">{label}</div>
              <div className="num text-2xl font-extrabold truncate">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-8">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
          <h3 className="font-bold">{t.monthlyRevenue}</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-2"><i className="dot dot-primary" /> {t.revenue}</span>
            <span className="flex items-center gap-2"><i className="dot dot-danger" /> {t.expenses}</span>
          </div>
        </div>
        <div className="chart" tabIndex={0} role="region" aria-label={locale === 'fa' ? 'نمودار گزارش مالی' : 'Financial report chart'}>
          {data.byMonth.map((m: any) => (
            <div key={m.month} className="chart-col" title={`${m.month}: ${money(m.revenue)}`}>
              <div className="chart-bars">
                <div className="chart-bar bar-primary" style={{ height: `${Math.max(2, (m.revenue / maxRevenue) * 100)}%` }} />
                <div className="chart-bar bar-danger" style={{ height: `${Math.max(1, (m.expenses / maxRevenue) * 100)}%` }} />
              </div>
              <div className="chart-label">{monthName(m.month)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2 mb-8">
        <div className="card">
          <h3 className="font-bold mb-4">{t.byGateway}</h3>
          {data.byGateway.length === 0 && <p className="muted">—</p>}
          <div className="space-y-4">
            {data.byGateway.map((g: any) => (
              <div key={g.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-semibold">{g.name}{g.provider && g.provider !== g.name && <small className="muted" dir="ltr"> {g.provider}</small>}</span>
                  <span className="num">{money(g.amount)} · <span className="muted">{num(g.count)} {isFa ? 'پرداخت' : 'payments'}</span></span>
                </div>
                <div className="meter"><div className="meter-fill" style={{ width: `${(g.amount / maxGateway) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold mb-4">{t.byPlan}</h3>
          {data.byPlan.length === 0 && <p className="muted">—</p>}
          <div className="space-y-4">
            {data.byPlan.map((p: any) => (
              <div key={p.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-semibold truncate">{p.name}</span>
                  <span className="num">{money(p.amount)}</span>
                </div>
                <div className="meter"><div className="meter-fill meter-accent" style={{ width: `${(p.amount / maxPlan) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2 mb-8">
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t.topCustomers}</h3>
            <Link href="/admin/users" className="muted text-xs">{t.customers} →</Link>
          </div>
          <table className="data">
            <thead>
              <tr><th>{t.customer}</th><th>{t.paymentsCount}</th><th>{t.amount}</th></tr>
            </thead>
            <tbody>
              {data.topCustomers.map((c: any) => (
                <tr key={c.email}>
                  <td dir="ltr">{c.email}</td>
                  <td className="num">{num(c.count)}</td>
                  <td className="num font-semibold">{money(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t.expenses}</h3>
            <Link href="/admin/expenses" className="muted text-xs">{t.manageExpenses} →</Link>
          </div>
          {data.recentExpenses.length === 0 && <p className="muted">{t.noExpenses}</p>}
          <div className="space-y-3">
            {data.recentExpenses.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-b border-var pb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{e.title}</div>
                  <div className="muted text-xs">{t[`exp${e.category}` as keyof typeof t] || e.category} · {fmtDate(e.spentAt)}</div>
                </div>
                <span className="num font-semibold">−{money(e.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{t.recentPayments}</h3>
          <Link href="/admin/payments" className="muted text-xs">{t.viewAll} →</Link>
        </div>
        {data.recentPayments.length === 0 ? (
          <p className="muted">{t.noPayments}</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.customer}</th>
                <th>{t.gateway}</th>
                <th>{t.crypto}</th>
                <th>{t.amount}</th>
                <th>{t.status}</th>
                <th>{t.date}</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.map((p: any) => (
                <tr key={p.id}>
                  <td className="num">{p.id}</td>
                  <td dir="ltr">{p.user}</td>
                  <td>{p.gatewayName || p.provider}</td>
                  <td className="num">{p.cryptoCurrency || '—'} {p.cryptoAmount ? `· ${p.cryptoAmount}` : ''}</td>
                  <td className={`num font-semibold ${p.amount < 0 ? 'error-text' : ''}`}>{money(p.amount)}</td>
                  <td><StatusBadge value={p.status === 'CONFIRMED' ? 'PAID' : p.status} /></td>
                  <td className="num">{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
