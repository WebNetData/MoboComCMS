'use client'

import SubscriptionAlertPreference from '@/components/SubscriptionAlertPreference'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { SubSummary } from '@/components/SubscriptionCard'
import SubscriptionRow from '@/components/SubscriptionRow'
import MiniAppFeedView from './MiniAppFeed'
import { PluginOutlet } from '@/plugins/registry'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { useSite } from '@/components/site/SiteProvider'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { customerOverview, sortCustomerSubscriptions } from '@/modules/subscriptions/domain/customer-overview'

export default function MiniAppHome() {
  const params = useSearchParams()
  const router = useRouter()
  const renewalId = params.get('renew') === '1' ? Number(params.get('subscription')) : 0
  const { data: session } = useSession()
  const { t, locale } = useI18n()
  // Without the VPN module the mini app home is wallet, shop and shared site content.
  const vpnOn = useModuleEnabled('vpn')
  const site = useSite()
  const fa = locale === 'fa'
  const [subs, setSubs] = useState<SubSummary[]>([])
  const [balances, setBalances] = useState<{ currency: string; balance: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const load = useCallback(async () => {
    setLoadError(false)
    const [subscriptions, wallet] = await Promise.allSettled([vpnOn ? fetch('/api/subscriptions') : Promise.resolve(new Response('[]', { status: 200 })), fetch('/api/wallet')])
    const subscriptionsResponse = subscriptions.status === 'fulfilled' ? subscriptions.value : null
    const walletResponse = wallet.status === 'fulfilled' ? wallet.value : null
    if (subscriptionsResponse?.ok) setSubs((await subscriptionsResponse.json().catch(() => null)) || [])
    else setLoadError(true)
    if (walletResponse?.ok) setBalances((await walletResponse.json().catch(() => null))?.balances || [])
    setLoading(false)
  }, [vpnOn])
  useEffect(() => { void load() }, [load])
  // Telegram renewal deep link: the list only names subscriptions now, so the
  // link opens the subscription page and lets it raise the renewal dialog.
  useEffect(() => {
    if (renewalId > 0) router.replace(`/miniapp/subscriptions/${renewalId}?renew=1`)
  }, [renewalId, router])
  const overview = customerOverview(subs)
  const wallet = balances.length ? balances.map(balance => formatCurrency(balance.balance, balance.currency, fa ? 'fa-IR' : 'en-US')).join(' · ') : '—'
  const traffic = loadError || !overview.active ? '—' : `${Number(overview.usedGB.toFixed(2))} / ${overview.limitGB === null ? '∞' : Number(overview.limitGB.toFixed(2))} GB`

  return <div>
    <div className="tg-hero"><div className="tg-hero-copy"><span className="tg-eyebrow"><Icon name={vpnOn ? 'shield' : 'sparkles'} size={15} />{vpnOn ? (fa ? 'فضای امن شما' : 'Your secure space') : (fa ? 'حساب شما' : 'Your account')}</span><div className="muted text-xs">{t.welcomeBack}</div><h1 className="font-bold text-lg truncate">{session?.user?.name || session?.user?.email}</h1></div><div className="tg-hero-actions">{vpnOn ? <Link href="/miniapp/plans" className="btn btn-primary btn-sm">{t.newPlan}</Link> : <Link href="/miniapp/wallet" className="btn btn-primary btn-sm">{fa ? 'شارژ کیف پول' : 'Top up wallet'}</Link>}</div></div>
    {vpnOn ? <div className="tg-kpis"><div className="tg-kpi"><Icon name="shield" size={20} /><span className="muted text-xs">{t.activeSubs}</span><b className="num">{loadError ? '—' : overview.active}</b></div><div className="tg-kpi"><Icon name="bolt" size={20} /><span className="muted text-xs">{t.usage}</span><b className="num">{traffic}</b></div><div className="tg-kpi"><Icon name="wallet" size={20} /><span className="muted text-xs">{t.walletBalance}</span><b className="num">{wallet}</b></div></div> : <div className="card tg-feed-banner"><span className="tg-eyebrow"><Icon name="wallet" size={14} />{t.walletBalance}</span><h2 className="num">{wallet}</h2></div>}
    {overview.attention > 0 && <p className="card p-3 text-sm mb-4" role="status">⚠ {fa ? `${overview.attention} اشتراک به تمدید یا بررسی حجم نیاز دارد.` : `${overview.attention} subscription(s) need renewal or data review.`}</p>}
    {loading && <p className="muted text-sm">{t.loading}</p>}
    {loadError && <div className="card p-4 mb-4" role="alert"><p className="error-text mb-3">{fa ? 'دریافت اشتراک‌ها انجام نشد.' : 'Subscriptions could not be loaded.'}</p><button className="btn btn-ghost" onClick={load}>{fa ? 'تلاش دوباره' : 'Retry'}</button></div>}
    {vpnOn && !loading && !loadError && subs.length === 0 && <div className="card tg-empty"><div className="tile-icon mx-auto"><Icon name="globe" size={30} /></div><p className="muted mb-3">{t.noSubs}</p><Link href="/miniapp/plans" className="btn btn-primary">{t.viewPlans}</Link></div>}
    {subs.length > 0 && <div className="sub-list">{sortCustomerSubscriptions(subs).map(sub => <SubscriptionRow key={sub.id} sub={sub} compact />)}</div>}
    <PluginOutlet slot="miniapp.home" site={site} locale={locale} />
    <MiniAppFeedView />
    {vpnOn && <SubscriptionAlertPreference />}
  </div>
}
