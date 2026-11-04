'use client'

import SubscriptionAlertPreference from '@/components/SubscriptionAlertPreference'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { SubSummary } from '@/components/SubscriptionCard'
import SubscriptionRow from '@/components/SubscriptionRow'
import { PluginOutlet } from '@/plugins/registry'
import { useSite } from '@/components/site/SiteProvider'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { customerOverview, sortCustomerSubscriptions } from '@/modules/subscriptions/domain/customer-overview'
import type { accountOverview } from '@/modules/account/server/overview'
import { useMiniAppResource } from './useMiniAppResource'
import MiniAppReadState from './MiniAppReadState'
import MiniAppFeedView from './MiniAppFeed'

type Overview = NonNullable<Awaited<ReturnType<typeof accountOverview>>>

export default function MiniAppHome() {
  const account = useMiniAppResource<Overview>('/api/my/overview')
  const { locale } = useI18n()
  const site = useSite()
  return <div>
    {account.data ? <HomeAccount account={account.data} /> : <MiniAppReadState error={account.error} retry={account.retry} />}
    <nav className="tg-quick-actions" aria-label={locale === 'fa' ? 'دسترسی سریع حساب' : 'Quick account actions'}><Link href="/miniapp/orders"><Icon name="bag" size={17} />{locale === 'fa' ? 'سفارش‌ها' : 'Orders'}</Link><Link href="/miniapp/library"><Icon name="bookmark" size={17} />{locale === 'fa' ? 'کتابخانه' : 'Library'}</Link><Link href="/miniapp/support"><Icon name="chat" size={17} />{locale === 'fa' ? 'پشتیبانی' : 'Support'}</Link></nav>
    <PluginOutlet slot="miniapp.home" site={site} locale={locale} />
    <MiniAppFeedView />
  </div>
}

function HomeAccount({ account }: { account: Overview }) {
  const { t, locale } = useI18n()
  const fa = locale === 'fa'
  const vpnOn = account.modules.vpn
  const wallet = account.money.length ? account.money.map(row => formatCurrency(row.balance, row.currency, fa ? 'fa-IR' : 'en-US')).join(' · ') : '—'
  return <>
    <div className="tg-hero"><div className="tg-hero-copy"><span className="tg-eyebrow"><Icon name="sparkles" size={15} />{fa ? 'حساب شما' : 'Your account'}</span><div className="muted text-xs">{t.welcomeBack}</div><h1 className="font-bold text-lg truncate">{account.user.name}</h1></div><div className="tg-hero-actions"><Link href="/miniapp/wallet" className="btn btn-primary btn-sm">{fa ? 'شارژ کیف پول' : 'Top up wallet'}</Link></div></div>
    <div className="card tg-feed-banner"><span className="tg-eyebrow"><Icon name="wallet" size={14} />{t.walletBalance}</span><h2 className="num">{wallet}</h2></div>
    {vpnOn && <><HomeSubscriptions /><SubscriptionAlertPreference /></>}
  </>
}

/** Account's canonical current-user policy decides whether to even request VPN data. */
function HomeSubscriptions() {
  const { data: subs, loading, error, retry } = useMiniAppResource<SubSummary[]>('/api/subscriptions')
  const { t, locale } = useI18n()
  if (loading || error || !subs) return <MiniAppReadState error={error} retry={retry} />
  const overview = customerOverview(subs)
  return <section className="tg-account-group"><div className="tg-section-title"><h2>{locale === 'fa' ? 'اشتراک‌های من' : 'My subscriptions'}</h2><Link href="/miniapp/plans">{t.newPlan}</Link></div>
    {overview.attention > 0 && <p className="card p-3 text-sm mb-4" role="status">{locale === 'fa' ? 'برخی اشتراک‌ها به تمدید یا بررسی حجم نیاز دارند.' : 'Some subscriptions need renewal or data review.'}</p>}
    {subs.length ? <div className="sub-list">{sortCustomerSubscriptions(subs).map(sub => <SubscriptionRow key={sub.id} sub={sub} compact />)}</div> : <p className="card muted">{t.noSubs}</p>}
  </section>
}
