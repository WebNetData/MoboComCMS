'use client'

import { useCallback, useEffect, useState } from 'react'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { getCookie } from '@/platform/browser/preferences'
import { formatCurrency } from '@/shared/money/client'

interface OrderRow {
  id: number
  user: string
  plan: string
  amount: number
  currency: string
  status: string
  paidCrypto: string
  paidAmount: string
  createdAt: string
}

export default function AdminOrdersPage() {
  const { t, locale } = useI18n()
  const theme = getCookie('theme') || 'dark'
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async (status = '') => {
    const res = await fetch('/api/admin/orders' + (status ? `?status=${status}` : ''))
    if (res.ok) setOrders(await res.json())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function act(id: number, action: string) {
    setMsg('')
    const res = await fetch('/api/admin/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) setMsg(data?.error || t.errGeneric)
    else load(filter)
  }

  function fmt(d: string) {
    return new Date(d).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="h2">{t.orders}</h1>
        <select aria-label="وضعیت سفارش‌ها" className="select imp-w-48" value={filter} onChange={(e) => { setFilter(e.target.value); load(e.target.value) }}>
          <option value="">{t.all}</option>
          <option value="PENDING">{t.stPENDING}</option>
          <option value="PAID">{t.stPAID}</option>
          <option value="FAILED">{t.stFAILED}</option>
          <option value="EXPIRED">{t.stEXPIRED}</option>
          <option value="CANCELLED">{t.stCANCELLED}</option>
        </select>
      </div>
      {msg && <p className="error-text mb-4">{msg}</p>}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>{t.customer}</th>
              <th>{t.plan}</th>
              <th>{t.amount}</th>
              <th>{t.paidWith}</th>
              <th>{t.status}</th>
              <th>{t.date}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="num">{o.id}</td>
                <td dir="ltr">{o.user}</td>
                <td>{o.plan}</td>
                <td className="num">{formatCurrency(o.amount, o.currency, locale === 'fa' ? 'fa-IR' : 'en-US')}</td>
                <td className="muted num">{o.paidCrypto ? `${o.paidAmount} ${o.paidCrypto}` : '—'}</td>
                <td><StatusBadge value={o.status} /></td>
                <td>{fmt(o.createdAt)}</td>
                <td>
                  {o.status !== 'PAID' && (
                    <div className="flex gap-1">
                      <button className="badge badge-green" onClick={() => act(o.id, 'markPaid')}>{t.markPaid}</button>
                      <button className="badge badge-red" onClick={() => act(o.id, 'cancel')}>{t.delete}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={8} className="muted text-center py-8">{t.noOrders}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
