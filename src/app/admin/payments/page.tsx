'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

interface Payment {
  id: number
  provider: string
  status: string
  amount: number
  currency: string
  cryptoCurrency: string
  cryptoAmount: string
  fee: number
  txnId: string
  gatewayName: string
  user: string
  orderId: number | null
  invoiceNumber: string
  createdAt: string
  confirmedAt: string | null
}

const STATUSES = ['', 'CONFIRMED', 'PENDING', 'FAILED', 'REFUNDED']
/** Providers without a configured gateway row (the wallet, older records) still read by name. */
const PROVIDER_FA: Record<string, string> = { WALLET: 'کیف پول', PLISIO: 'Plisio (رمزارز)', CARD_TRANSFER: 'کارت به کارت', FRENZYEX: 'درگاه ارزی ریالی', MELLAT: 'بانک ملت', MANUAL: 'ثبت دستی', SNAPPPAY: 'اسنپ‌پی' }

export default function AdminPaymentsPage() {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [rows, setRows] = useState<Payment[]>([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/payments?status=${status}&q=${encodeURIComponent(q)}`)
    if (res.ok) setRows(await res.json())
    setLoading(false)
  }, [status, q])

  useEffect(() => {
    load()
  }, [load])

  const money = (n: number, currency: string) => formatCurrency(n, currency, isFa ? 'fa-IR' : 'en-US')
  const fmtDate = (d: string) => new Date(d).toLocaleString(isFa ? 'fa-IR' : 'en-US')

  const confirmed = rows.filter((r) => r.status === 'CONFIRMED')
  const grouped = confirmed.reduce((map, row) => {
    const currency = String(row.currency || 'USD').toUpperCase()
    const current = map.get(currency) || { amount: 0, fee: 0 }
    current.amount += Number(row.amount || 0)
    current.fee += Number(row.fee || 0)
    map.set(currency, current)
    return map
  }, new Map<string, { amount: number; fee: number }>())
  const groupedRows = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
  const groupedText = (field: 'amount' | 'fee') => groupedRows.length
    ? groupedRows.map(([currency, value]) => money(value[field], currency)).join(' · ')
    : '—'

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="h2">{t.ledger}</h1>
          <p className="muted">{t.ledgerHint}</p>
        </div>
        <Link href="/admin/finance" className="btn btn-ghost">{t.financeAdmin}</Link>
      </div>

      <div className="grid-3 mb-6">
        <div className="card kpi kpi-green">
          <div className="kpi-icon">💳</div>
          <div><div className="muted text-xs">{t.collected}</div><div className="num text-xl font-extrabold">{groupedText('amount')}</div></div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon">🏦</div>
          <div><div className="muted text-xs">{t.gatewayFees}</div><div className="num text-xl font-extrabold">{groupedText('fee')}</div></div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon">🧾</div>
          <div><div className="muted text-xs">{t.paymentsCount}</div><div className="num text-2xl font-extrabold">{rows.length}</div></div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="tabs">
            {STATUSES.map((s) => (
              <button key={s || 'all'} className={`tab ${status === s ? 'tab-active' : ''}`} onClick={() => setStatus(s)}>
                {s ? (t as Record<string, string>)[`pay${s}`] || s : t.all}
              </button>
            ))}
          </div>
          <input className="input imp-w-56" placeholder={t.searchPayments} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="muted text-center py-8">{t.loading}</p>
        ) : rows.length === 0 ? (
          <p className="muted text-center py-8">{t.noPayments}</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.customer}</th>
                <th>{t.gateway}</th>
                <th>{t.txId}</th>
                <th>{t.crypto}</th>
                <th>{t.amount}</th>
                <th>{t.gatewayFees}</th>
                <th>{t.status}</th>
                <th>{t.invoice}</th>
                <th>{t.date}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="num">{p.id}</td>
                  <td dir="ltr">{p.user}</td>
                  <td>{p.gatewayName || PROVIDER_FA[p.provider] || p.provider}</td>
                  <td className="num mute-truncate" dir="ltr">{p.txnId ? p.txnId.slice(0, 14) + '…' : '—'}</td>
                  <td className="num">{p.cryptoCurrency || '—'} {p.cryptoAmount ? `· ${p.cryptoAmount}` : ''}</td>
                  <td className={`num font-semibold ${p.amount < 0 ? 'error-text' : ''}`}>{money(p.amount, p.currency)}</td>
                  <td className="num muted">{money(p.fee, p.currency)}</td>
                  <td><StatusBadge value={p.status === 'CONFIRMED' ? 'PAID' : p.status} /></td>
                  <td className="num">
                    {p.invoiceNumber ? <Link href={`/invoice/${p.invoiceNumber}`} className="badge badge-gray" dir="ltr">{p.invoiceNumber}</Link> : '—'}
                  </td>
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
