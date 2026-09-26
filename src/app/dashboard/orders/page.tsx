'use client'

import { useEffect, useState } from 'react'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

interface Order {
  id: number
  plan: string
  amount: number
  currency: string
  status: string
  createdAt: string
}

export default function MyOrdersPage() {
  const { t, locale } = useI18n()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/my/orders').then((r) => (r.ok ? r.json() : [])).then((d) => { setOrders(d || []); setLoading(false) })
  }, [])

  function fmt(d: string) {
    return new Date(d).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')
  }

  return (
    <div>
      <h1 className="h2 mb-6">{t.myOrders}</h1>
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="muted text-center py-6">{t.loading}</p>
        ) : orders.length === 0 ? (
          <p className="muted text-center py-6">{t.noOrders}</p>
        ) : (
          <table className="data">
            <thead>
              <tr><th>#</th><th>{t.plan}</th><th>{t.amount}</th><th>{t.status}</th><th>{t.date}</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="num">{o.id}</td>
                  <td>{o.plan}</td>
                  <td className="num">{formatCurrency(o.amount, o.currency, locale === 'fa' ? 'fa-IR' : 'en-US')}</td>
                  <td><StatusBadge value={o.status} /></td>
                  <td>{fmt(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
