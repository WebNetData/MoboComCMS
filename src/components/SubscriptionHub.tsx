'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import SubscriptionCard, { type SubSummary } from '@/components/SubscriptionCard'
import StatusBadge from '@/components/StatusBadge'
import TicketStatusBadge from '@/components/TicketStatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

type Activity = {
  orders: { id: number; kind: 'purchase' | 'renewal'; status: string; totalAmount: number; currency: string; createdAt: string; invoice: { number: string; status: string } | null }[]
  tickets: { id: number; subject: string; status: string; department: string; updatedAt: string }[]
}

export default function SubscriptionHub({ id, mini = false }: { id: number; mini?: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const [subscription, setSubscription] = useState<SubSummary | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [renewOpen, setRenewOpen] = useState(false)
  const base = mini ? '/miniapp' : '/dashboard'
  const date = (value: string) => new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  // deep link from the mini app list / Telegram: `/subscriptions/<id>?renew=1`
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('renew') === '1') setRenewOpen(true)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [subscriptionsResponse, activityResponse] = await Promise.all([
        fetch('/api/subscriptions', { cache: 'no-store' }),
        fetch(`/api/subscriptions/${id}/activity`, { cache: 'no-store' }),
      ])
      if (!subscriptionsResponse.ok || !activityResponse.ok) throw Error()
      const subscriptions: SubSummary[] = await subscriptionsResponse.json()
      const own = subscriptions.find(item => item.id === id)
      if (!own) throw Error('not-found')
      setSubscription(own)
      setActivity(await activityResponse.json())
    } catch { setError(L('Subscription details could not be loaded. Please retry.', 'دریافت جزئیات اشتراک ممکن نشد؛ دوباره تلاش کنید.')) }
    finally { setLoading(false) }
  }, [id, fa])

  useEffect(() => { void load() }, [load])

  return <section className={`subscription-hub ${mini ? 'subscription-hub-mini' : ''}`}>
    <header className="subscription-hub-head"><div><Link className="text-link" href={base}>{L('← My subscriptions', '← اشتراک‌های من')}</Link><span className="ticket-eyebrow">MOBOCOMCMS / {L('SERVICE CENTER', 'مرکز اشتراک')}</span><h1>{subscription ? subscription.planName : `${L('Subscription', 'اشتراک')} #${id}`}</h1><p>{subscription ? `#${subscription.id} · ${subscription.username}${subscription.panelName ? ` · ${subscription.panelName}` : ''}` : L('Connection, usage, devices, purchases and support in one place.', 'اتصال، مصرف، دستگاه‌ها، خریدها و پشتیبانی در یک صفحه.')}</p></div><button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={loading}>{L('Refresh', 'به‌روزرسانی')}</button></header>
    {loading && !subscription && <p className="card" role="status">{L('Loading subscription…', 'در حال دریافت اشتراک…')}</p>}
    {error && <div className="ticket-alert" role="alert">{error} <button className="btn btn-ghost" type="button" onClick={() => void load()}>{L('Retry', 'تلاش دوباره')}</button></div>}
    {subscription && <SubscriptionCard sub={subscription} compact={mini} showDetailsLink={false} initialRenewalOpen={renewOpen} onChanged={() => void load()} />}
    {activity && <div className="subscription-hub-grid">
      <section className="subscription-hub-panel"><div className="subscription-hub-panel-head"><h2>{L('Purchase and renewal history', 'تاریخچهٔ خرید و تمدید')}</h2>{!mini && <Link href="/dashboard/orders" className="text-link">{L('All orders', 'همهٔ سفارش‌ها')}</Link>}</div>{activity.orders.length ? <div className="subscription-hub-list">{activity.orders.map(order => <div className="subscription-hub-row" key={order.id}><div><strong>{order.kind === 'purchase' ? L('Initial purchase', 'خرید اولیه') : L('Renewal', 'تمدید')} #{order.id}</strong><small>{date(order.createdAt)}</small><small>{formatCurrency(order.totalAmount, order.currency, fa ? 'fa-IR' : 'en-US')}</small></div><div><StatusBadge value={order.status} />{order.invoice && <Link className="text-link" href={`/invoice/${encodeURIComponent(order.invoice.number)}`}>{L('Invoice', 'فاکتور')} ↗</Link>}</div></div>)}</div> : <p className="muted">{L('No purchase records yet.', 'هنوز سابقهٔ خریدی ثبت نشده است.')}</p>}</section>
      <section className="subscription-hub-panel"><div className="subscription-hub-panel-head"><h2>{L('Related support tickets', 'تیکت‌های این اشتراک')}</h2><Link href={`${base}/${mini ? 'support' : 'tickets'}`} className="text-link">{L('Support center', 'مرکز پشتیبانی')}</Link></div>{activity.tickets.length ? <div className="subscription-hub-list">{activity.tickets.map(ticket => <Link href={`${base}/${mini ? 'support' : 'tickets'}?ticket=${ticket.id}`} className="subscription-hub-row" key={ticket.id}><div><strong>#{ticket.id} · {ticket.subject}</strong><small>{date(ticket.updatedAt)}</small></div><TicketStatusBadge value={ticket.status} /></Link>)}</div> : <p className="muted">{L('No tickets for this subscription yet. Use “Report a connection issue” above if you need help.', 'برای این اشتراک هنوز تیکتی ثبت نشده است. در صورت نیاز از «گزارش مشکل اتصال» در بالا استفاده کنید.')}</p>}</section>
    </div>}
  </section>
}
