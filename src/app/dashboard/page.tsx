'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import type { SubSummary } from '@/components/SubscriptionCard'
import SubscriptionRow from '@/components/SubscriptionRow'
import VipAccountCard from '@/components/VipAccountCard'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { customerOverview, sortCustomerSubscriptions, subscriptionState } from '@/modules/subscriptions/domain/customer-overview'

type Sub = SubSummary

interface Order {
  id: number
  plan: string
  amount: number
  currency: string
  status: string
  createdAt: string
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [subs, setSubs] = useState<Sub[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [invoiceTotals, setInvoiceTotals] = useState<{ currency: string; paid: number; unpaid: number }[]>([])
  const [balances, setBalances] = useState<{ currency: string; balance: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'attention' | 'inactive'>('all')

  const load = useCallback(async () => {
    setLoadError('')
    const responses = await Promise.allSettled([
      fetch('/api/subscriptions'),
      fetch('/api/my/orders'),
      fetch('/api/my/invoices'),
      fetch('/api/wallet'),
    ])
    const [subsRes, ordersRes, invRes, walletRes] = responses.map(result => result.status === 'fulfilled' ? result.value : null)
    if (subsRes?.ok) setSubs((await subsRes.json().catch(() => null)) || [])
    else setLoadError('subscriptions')
    if (ordersRes?.ok) setOrders((await ordersRes.json().catch(() => null)) || [])
    if (invRes?.ok) setInvoiceTotals((await invRes.json().catch(() => null))?.totalsByCurrency || [])
    if (walletRes?.ok) setBalances((await walletRes.json().catch(() => null))?.balances || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isFa ? 'fa-IR' : 'en-US')
  const money = (n: number, currency: string) => formatCurrency(n, currency, isFa ? 'fa-IR' : 'en-US')
  const balanceText = balances.length ? balances.map((b) => money(b.balance, b.currency)).join(' · ') : '—'
  const unpaidText = invoiceTotals.length ? invoiceTotals.map((x) => money(x.unpaid, x.currency)).join(' · ') : '—'
  const hasUnpaid = invoiceTotals.some((x) => x.unpaid > 0)

  const overview = customerOverview(subs)
  const shown = sortCustomerSubscriptions(subs).filter((sub) => {
    const state = subscriptionState(sub)
    const matches = `${sub.planName} ${sub.username} ${sub.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    return matches && (filter === 'all' || (filter === 'active' && (state === 'active' || state === 'attention')) || (filter === 'attention' && state === 'attention') || (filter === 'inactive' && (state === 'disabled' || state === 'expired' || state === 'pending')))
  })

  const kpis: [string, string, string, string][] = [
    [t.activeSubs, loadError ? '—' : String(overview.active), '🔗', 'kpi-green'],
    [t.usage, loadError || !overview.active ? '—' : `${Number(overview.usedGB.toFixed(2))} / ${overview.limitGB === null ? '∞' : Number(overview.limitGB.toFixed(2))} GB`, '📊', ''],
    [t.walletBalance, balanceText, '💳', ''],
    [t.unpaidAmount, unpaidText, '🧾', hasUnpaid ? 'kpi-amber' : ''],
  ]

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">{t.welcomeBack} {session?.user?.name || ''} 👋</h1>
          <p className="muted">{t.dashSub}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/wallet" className="btn btn-ghost">💳 {t.topUp}</Link>
          <Link href="/plans" className="btn btn-primary">{t.newPlan}</Link>
        </div>
      </div>

      <VipAccountCard />

      <div className="grid-4 mb-8">
        {kpis.map(([label, value, icon, cls]) => (
          <div key={label} className={`card kpi ${cls}`}>
            <div className="kpi-icon">{icon}</div>
            <div className="min-w-0">
              <div className="muted text-xs">{label}</div>
              <div className="num text-2xl font-extrabold truncate">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-columns">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="h2">{t.mySubs}</h2>
            {overview.attention > 0 && <span className="badge badge-amber">⚠ {overview.attention} {isFa ? 'اشتراک نیازمند توجه' : 'need attention'}</span>}
          </div>

          {subs.length > 0 && <div className="card mb-4 flex flex-wrap gap-3 items-center">
            <input className="input" style={{ flex: '1 1 220px' }} aria-label={isFa ? 'جست‌وجوی اشتراک' : 'Search subscriptions'} placeholder={isFa ? 'جست‌وجو با نام پلن یا نام کاربری…' : 'Search by plan or username…'} value={query} onChange={event => setQuery(event.target.value)} />
            <select className="select" style={{ flex: '0 1 180px' }} aria-label={isFa ? 'فیلتر اشتراک‌ها' : 'Filter subscriptions'} value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
              <option value="all">{isFa ? 'همه اشتراک‌ها' : 'All subscriptions'}</option>
              <option value="active">{isFa ? 'فعال' : 'Active'}</option>
              <option value="attention">{isFa ? 'نیازمند توجه' : 'Needs attention'}</option>
              <option value="inactive">{isFa ? 'غیرفعال یا منقضی' : 'Inactive or expired'}</option>
            </select>
          </div>}

          {loading && <p className="muted">{t.loading}</p>}
          {loadError && <div className="card mb-4" role="alert"><p className="error-text mb-3">{isFa ? 'دریافت اشتراک‌ها انجام نشد. اتصال را بررسی و دوباره تلاش کنید.' : 'Subscriptions could not be loaded. Check your connection and try again.'}</p><button className="btn btn-ghost" onClick={load}>{isFa ? 'تلاش دوباره' : 'Retry'}</button></div>}

          {!loading && !loadError && subs.length === 0 && (
            <div className="card empty-state">
              <div className="tile-icon mx-auto">🔗</div>
              <p className="muted mb-4">{t.noSubs}</p>
              <Link href="/plans" className="btn btn-primary">{t.viewPlans}</Link>
            </div>
          )}

          {!loading && subs.length > 0 && shown.length === 0 && <div className="card empty-state muted">{isFa ? 'اشتراکی با این جست‌وجو یا فیلتر پیدا نشد.' : 'No subscriptions match this search or filter.'}</div>}

          {shown.length > 0 && (
            <div className="sub-list">
              {shown.map((s) => (
                <SubscriptionRow key={s.id} sub={s} />
              ))}
            </div>
          )}
          {shown.length > 0 && (
            <p className="muted text-xs mt-3">{isFa ? 'برای اتصال، تمدید، دستگاه‌ها و تاریخچه، روی هر اشتراک بزنید.' : 'Open a subscription to connect, renew, manage devices and see its history.'}</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card">
            <h3 className="font-bold mb-3">✈️ {t.telegramTitle}</h3>
            <p className="muted mb-3">{t.telegramDashHint}</p>
            <Link href="/dashboard/profile" className="btn btn-ghost w-full">{t.telegramConnect}</Link>
          </div>

          <div className="card">
            <h3 className="font-bold mb-3">{t.needHelp}</h3>
            <p className="muted mb-3">{t.why3d}</p>
            <Link href="/dashboard/tickets" className="btn btn-ghost w-full">{t.contactSupport}</Link>
          </div>

          <div className="card">
            <h3 className="font-bold mb-3">{t.recentActivity}</h3>
            {orders.length === 0 && <p className="muted">{t.noOrders}</p>}
            <div className="flex flex-col gap-3">
              {orders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 border-b border-var pb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{o.plan}</div>
                    <div className="muted text-xs num">{fmtDate(o.createdAt)}</div>
                  </div>
                  <div className="text-end">
                    <div className="num text-sm font-semibold">{money(o.amount, o.currency)}</div>
                    <StatusBadge value={o.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
