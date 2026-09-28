'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

interface Invoice {
  id: number
  number: string
  title: string
  kind: string
  subtotal: number
  discount: number
  tax: number
  total: number
  currency: string
  status: string
  gatewayName: string
  provider: string
  paidCrypto: string
  paidAt: string | null
  issuedAt: string
  dueAt: string | null
  url: string
  paymentUrl: string
  deliveryStatus: string
  subscriptionId: number | null
}

export default function CustomerInvoicesPage() {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [rows, setRows] = useState<Invoice[]>([])
  const [totals, setTotals] = useState<{ currency: string; paid: number; unpaid: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/my/invoices')
    if (res.ok) {
      const data = await res.json()
      setRows(data.invoices || [])
      setTotals(data.totalsByCurrency || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const money = (n: number, currency: string) => formatCurrency(n, currency, isFa ? 'fa-IR' : 'en-US')
  const totalsText = (field: 'paid' | 'unpaid') => totals.length ? totals.map((x) => money(x[field], x.currency)).join(' · ') : '—'
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US') : '—')
  const filtered = status ? rows.filter((r) => r.status === status) : rows
  const deliveryLabel = (value: string) => value === 'DELIVERED' ? (isFa ? 'تحویل داده شد' : 'Delivered') : value === 'RETRYING' ? (isFa ? 'در حال تلاش دوباره' : 'Retrying delivery') : (isFa ? 'در حال آماده‌سازی' : 'Preparing delivery')

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="h2">{t.myInvoices}</h1>
          <p className="muted">{t.myInvoicesHint}</p>
        </div>
        <Link href="/plans" className="btn btn-primary">{t.newPlan}</Link>
      </div>

      <div className="grid-3 mb-6">
        <div className="card kpi kpi-green">
          <div className="kpi-icon">✅</div>
          <div><div className="muted text-xs">{t.totalPaid}</div><div className="num text-xl font-extrabold">{totalsText('paid')}</div></div>
        </div>
        <div className="card kpi kpi-amber">
          <div className="kpi-icon">⏳</div>
          <div><div className="muted text-xs">{t.unpaidAmount}</div><div className="num text-xl font-extrabold">{totalsText('unpaid')}</div></div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon">📄</div>
          <div><div className="muted text-xs">{t.invoices}</div><div className="num text-2xl font-extrabold">{rows.length}</div></div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="tabs">
          {['', 'UNPAID', 'PAID', 'VOID', 'REFUNDED'].map((s) => (
            <button key={s || 'all'} className={`tab ${status === s ? 'tab-active' : ''}`} onClick={() => setStatus(s)}>
              {s ? (t as Record<string, string>)[`st${s}`] || s : t.all}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="muted text-center py-8">{t.loading}</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <p className="muted mb-3">{t.noInvoices}</p>
            <Link href="/plans" className="btn btn-primary">{t.viewPlans}</Link>
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>{t.invoiceNo}</th>
                <th>{t.item}</th>
                <th>{t.total}</th>
                <th>{t.status}</th>
                <th>{isFa ? 'تحویل' : 'Delivery'}</th>
                <th>{t.issuedAt}</th>
                <th>{t.dueAt}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td className="num font-semibold" dir="ltr">{i.number}</td>
                  <td>{i.title}</td>
                  <td className="num font-semibold">{money(i.total, i.currency)}</td>
                  <td><StatusBadge value={i.status} /></td>
                  <td>{i.status === 'PAID' ? <span className={i.deliveryStatus === 'DELIVERED' ? 'success-text' : 'muted'}>{deliveryLabel(i.deliveryStatus)}</span> : '—'}</td>
                  <td className="num">{fmtDate(i.issuedAt)}</td>
                  <td className="num">{fmtDate(i.dueAt)}</td>
                  <td>
                    <div className="flex gap-2 flex-wrap">
                      <Link href={i.url} className={`badge ${i.status === 'UNPAID' ? 'badge-green' : 'badge-gray'}`}>{i.status === 'UNPAID' ? t.payNow : t.view}</Link>
                      {i.status === 'UNPAID' && i.paymentUrl && <a href={i.paymentUrl} className="badge badge-green">{isFa ? 'ادامه پرداخت' : 'Resume payment'}</a>}
                      {i.subscriptionId && <Link href={`/dashboard/subscriptions/${i.subscriptionId}`} className="badge badge-gray">{t.viewSubscription}</Link>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
