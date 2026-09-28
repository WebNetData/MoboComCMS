'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import type { SubSummary } from '@/components/SubscriptionCard'
import SubscriptionRow from '@/components/SubscriptionRow'
import VipAccountCard from '@/components/VipAccountCard'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { customerOverview, sortCustomerSubscriptions, subscriptionState } from '@/modules/subscriptions/domain/customer-overview'
import { useExtensions } from '@/extensions/client/ExtensionProvider'
import Icon from '@/components/site/Icon'

type Sub = SubSummary

interface Order {
  id: number
  plan: string
  amount: number
  currency: string
  status: string
  createdAt: string
}

export default function VpnHome() {
  const { data: session } = useSession()
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  // Feature modules decide what the account home shows (VPN subscriptions vs. shop orders).
  const modules = useExtensions()
  const moduleOn = (id: string) => modules[id]?.enabled !== false
  const vpnOn = moduleOn('vpn')
  const shortcuts = [
    { id: 'store', href: '/products', fa: 'فروشگاه', en: 'Shop', icon: 'grid' },
    { id: 'membership', href: '/vip', fa: 'اشتراک ویژه', en: 'VIP', icon: 'shield' },
    { id: 'software', href: '/software', fa: 'نرم‌افزار', en: 'Software', icon: 'devices' },
    { id: 'forum', href: '/forum', fa: 'تالار گفتمان', en: 'Forum', icon: 'chat' },
    { id: 'music', href: '/music', fa: 'موزیک', en: 'Music', icon: 'sparkles' },
    { id: 'cinema', href: '/cinema', fa: 'فیلم و سریال', en: 'Movies', icon: 'globe' },
    { id: 'games', href: '/games', fa: 'بازی', en: 'Games', icon: 'bolt' },
    { id: 'journal', href: '/blog', fa: 'مجله', en: 'Magazine', icon: 'sliders' },
  ]
  const enabled = Object.fromEntries(shortcuts.map((item) => [item.id, moduleOn(item.id)])) as Record<string, boolean>
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
      vpnOn ? fetch('/api/subscriptions') : Promise.resolve(new Response('[]', { status: 200 })),
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
  }, [vpnOn])

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

  const kpis: [string, string, string, string][] = vpnOn ? [
    [t.activeSubs, loadError ? '—' : String(overview.active), '🔗', 'kpi-green'],
    [t.usage, loadError || !overview.active ? '—' : `${Number(overview.usedGB.toFixed(2))} / ${overview.limitGB === null ? '∞' : Number(overview.limitGB.toFixed(2))} GB`, '📊', ''],
    [t.walletBalance, balanceText, '💳', ''],
    [t.unpaidAmount, unpaidText, '🧾', hasUnpaid ? 'kpi-amber' : ''],
  ] : [
    [isFa ? 'سفارش‌ها' : 'Orders', loading ? '—' : orders.length.toLocaleString(isFa ? 'fa-IR' : 'en-US'), '🛍️', 'kpi-green'],
    [isFa ? 'سفارش‌های پرداخت‌شده' : 'Paid orders', loading ? '—' : orders.filter((o) => ['PAID', 'COMPLETED', 'DELIVERED', 'FULFILLED'].includes(o.status)).length.toLocaleString(isFa ? 'fa-IR' : 'en-US'), '✅', ''],
    [t.walletBalance, balanceText, '💳', ''],
    [t.unpaidAmount, unpaidText, '🧾', hasUnpaid ? 'kpi-amber' : ''],
  ]

  return (
    <div>
      <div className="appbar">
        <div>
          <h1 className="h2">{t.welcomeBack} {session?.user?.name || ''} 👋</h1>
          <p className="muted">{vpnOn ? t.dashSub : (isFa ? 'سفارش‌ها، کیف پول و حساب کاربری شما' : 'Your orders, wallet and account')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/wallet" className="btn btn-ghost">💳 {t.topUp}</Link>
          {vpnOn ? <Link href="/plans" className="btn btn-primary">{t.newPlan}</Link> : enabled.store && <Link href="/products" className="btn btn-primary">{isFa ? 'ورود به فروشگاه' : 'Visit the shop'}</Link>}
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
        {!vpnOn ? <div>
          <div className="flex items-center justify-between mb-4"><h2 className="h2">{isFa ? 'سفارش‌های اخیر' : 'Recent orders'}</h2><Link href="/dashboard/orders" className="btn btn-ghost btn-sm">{isFa ? 'همهٔ سفارش‌ها' : 'All orders'}</Link></div>
          {loading && <p className="muted">{t.loading}</p>}
          {!loading && orders.length === 0 && <div className="card empty-state"><div className="tile-icon mx-auto">🛍️</div><p className="muted mb-4">{t.noOrders}</p>{enabled.store && <Link href="/products" className="btn btn-primary">{isFa ? 'مشاهدهٔ محصولات' : 'Browse products'}</Link>}</div>}
          {orders.length > 0 && <div className="card mb-6"><div className="flex flex-col gap-3">{orders.slice(0, 8).map((o) => (
            <Link key={o.id} href="/dashboard/orders" className="flex items-center justify-between gap-2 border-b border-var pb-2">
              <div className="min-w-0"><div className="text-sm font-semibold truncate">{o.plan}</div><div className="muted text-xs num">#{o.id} · {fmtDate(o.createdAt)}</div></div>
              <div className="text-end"><div className="num text-sm font-semibold">{money(o.amount, o.currency)}</div><StatusBadge value={o.status} /></div>
            </Link>))}</div></div>}
          <h2 className="h2 mb-4">{isFa ? 'دسترسی سریع' : 'Shortcuts'}</h2>
          <div className="dash-shortcuts">{shortcuts.filter((item) => enabled[item.id]).map((item) => <Link key={item.id} href={item.href} className="card dash-shortcut"><span className="side-icon"><Icon name={item.icon} size={20} /></span><b>{isFa ? item.fa : item.en}</b></Link>)}</div>
        </div> : <div>
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
        </div>}

        <div className="flex flex-col gap-4">
          <div className="card">
            <h3 className="font-bold mb-3">✈️ {t.telegramTitle}</h3>
            <p className="muted mb-3">{vpnOn ? t.telegramDashHint : (isFa ? 'تلگرامت را وصل کن تا اعلان سفارش‌ها را بگیری و حسابت را داخل مینی‌اپ ببینی.' : 'Connect Telegram for order notifications and your account in the mini app.')}</p>
            <Link href="/dashboard/profile" className="btn btn-ghost w-full">{t.telegramConnect}</Link>
          </div>

          <div className="card">
            <h3 className="font-bold mb-3">{t.needHelp}</h3>
            <p className="muted mb-3">{t.why3d}</p>
            <Link href="/dashboard/tickets" className="btn btn-ghost w-full">{t.contactSupport}</Link>
          </div>

          {vpnOn && <div className="card">
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
          </div>}
        </div>
      </div>
    </div>
  )
}
