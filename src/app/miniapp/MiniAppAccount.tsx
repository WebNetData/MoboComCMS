'use client'

import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useSession } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import type { accountOverview } from '@/modules/account/server/overview'
import { miniAppHref } from '@/modules/site/domain/miniapp-navigation'
import { useMiniAppResource } from './useMiniAppResource'
import MiniAppReadState from './MiniAppReadState'
import MemberPromptShelf from '@/components/prompts/MemberPromptShelf'
import { useMemberLibraryRevision } from '@/components/engage/MemberLibrarySync'

type Overview = NonNullable<Awaited<ReturnType<typeof accountOverview>>>

export default function MiniAppAccount({ library = false }: { library?: boolean }) {
  const revision = useMemberLibraryRevision()
  const { data, loading, error, retry } = useMiniAppResource<Overview>('/api/my/overview', revision)
  const { data: session } = useSession()
  const { locale } = useI18n()
  const fa = locale === 'fa'
  if (loading || error || !data) return <MiniAppReadState error={error} retry={retry} />
  const groups = library ? [
    { title: fa ? 'کتابخانهٔ یکپارچه' : 'Your unified library', items: [
      { href: '/miniapp/purchases', icon: 'bag', label: fa ? 'خریدهای محتوا و فایل' : 'Content purchases' },
      ...(data.modules.reviews ? [{ href: '/favorites', icon: 'heart', label: fa ? 'همهٔ علاقه‌مندی‌ها' : 'All favorites' }] : []),
      { href: '/dashboard/collections', icon: 'layers', label: fa ? 'کالکشن‌های من' : 'My collections' },
      { href: '/dashboard/library', icon: 'bookmark', label: fa ? 'مدیریت کامل کتابخانه' : 'Manage the full library' },
      { href: '/dashboard/recent', icon: 'clock', label: fa ? 'اخیراً دیده‌شده' : 'Recently viewed' },
      ...(data.games ? [{ href: '/games/library', icon: 'gamepad', label: fa ? 'کتابخانهٔ بازی' : 'Game library' }] : []),
      ...(data.prompts ? [{ href: '/dashboard/prompts', icon: 'sparkles', label: fa ? 'خروجی‌های پرامپت من' : 'My prompt outputs' }] : []),
    ] },
  ] : [
    { title: fa ? 'خرید و خدمات من' : 'Purchases & services', items: [
      ...(data.modules.store ? [{ href: '/miniapp/orders', icon: 'bag', label: fa ? 'سفارش‌ها و دانلود فایل' : 'Orders & file downloads' }] : []),
      { href: '/miniapp/payments', icon: 'file', label: fa ? 'فاکتورها و پرداخت‌ها' : 'Invoices & payments' },
      { href: '/miniapp/wallet', icon: 'wallet', label: fa ? 'کیف پول و تراکنش‌ها' : 'Wallet & transactions' },
      { href: '/dashboard/requests', icon: 'layers', label: fa ? 'درخواست‌ها و فرم‌ها' : 'Requests & forms' },
      ...(data.modules.membership ? [{ href: '/vip/account', icon: 'crown', label: fa ? 'اشتراک ویژهٔ من' : 'My VIP membership' }] : []),
      ...(data.modules.vpn ? [{ href: '/miniapp/plans', icon: 'shield', label: fa ? 'پلن‌ها و اشتراک‌ها' : 'Plans & subscriptions' }] : []),
    ] },
    { title: fa ? 'حساب، ارتباط و امنیت' : 'Account, support & security', items: [
      { href: '/miniapp/library', icon: 'bookmark', label: fa ? 'کتابخانه و علاقه‌مندی‌ها' : 'Library & favorites' },
      { href: '/miniapp/support', icon: 'chat', label: fa ? 'پشتیبانی و تیکت‌ها' : 'Support & tickets' },
      { href: '/miniapp/notifications', icon: 'bell', label: fa ? 'اعلان‌ها' : 'Notifications' },
      { href: '/dashboard/public-profile', icon: 'user', label: fa ? 'تصویر و پروفایل من' : 'My picture & profile' },
      { href: '/dashboard/profile', icon: 'shield', label: fa ? 'اطلاعات حساب و امنیت' : 'Account & security' },
      { href: '/dashboard', icon: 'grid', label: fa ? 'داشبورد کامل من' : 'Full dashboard' },
    ] },
  ]
  const avatar = session?.user?.image || data.profile.avatar
  return <div className="tg-account">
    <header className="tg-account-profile">{avatar ? <img src={avatar} className="tg-account-avatar" alt="" /> : <span className="tg-account-avatar">{data.user.name?.slice(0, 1) || <Icon name="user" size={28} />}</span>}<div><span className="tg-eyebrow">{library ? (fa ? 'فضای شخصی شما' : 'Your personal space') : (fa ? 'همان حساب، در همهٔ موبوکام' : 'One account across MoboCom')}</span><h1>{library ? (fa ? 'کتابخانهٔ من' : 'My library') : data.user.name}</h1><p>{data.profile.headline || (fa ? 'خریدها، علاقه‌ها و ارتباط‌هایتان همیشه همراه شماست.' : 'Your purchases, favorites and connections stay with you.')}</p></div>{data.vip && <span className="tg-account-vip"><Icon name="crown" size={15} />VIP</span>}</header>
    {!library && <>
      <div className="tg-account-figures"><Link href="/miniapp/notifications"><Icon name="bell" size={19} /><b className="num">{data.inbox.unread.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b><small>{fa ? 'اعلان تازه' : 'Unread'}</small></Link><Link href="/miniapp/support"><Icon name="chat" size={19} /><b className="num">{data.inbox.tickets.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b><small>{fa ? 'تیکت باز' : 'Open tickets'}</small></Link><Link href="/miniapp/orders"><Icon name="bag" size={19} /><b className="num">{data.orders.inProgress.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b><small>{fa ? 'سفارش در جریان' : 'In progress'}</small></Link></div>
      {data.money.length > 0 && <Link href="/miniapp/wallet" className="tg-account-wallet"><span><Icon name="wallet" size={24} /><b>{fa ? 'موجودی کیف پول' : 'Wallet balance'}</b></span><strong className="num">{data.money.map(row => formatCurrency(row.balance, row.currency, fa ? 'fa-IR' : 'en-US')).join(' · ')}</strong><small>{fa ? 'مشاهدهٔ گردش حساب و افزایش موجودی' : 'View transactions & top up'}</small><Icon name="arrow" size={20} /></Link>}
    </>}
    {groups.map(group => <section className="tg-account-group" key={group.title}><h2>{group.title}</h2><div>{group.items.map(item => <Link key={item.href} href={miniAppHref(item.href)}><span className="tg-account-icon"><Icon name={item.icon} size={20} /></span><b>{item.label}</b><Icon name="arrow" size={16} /></Link>)}</div></section>)}
    {library && data.prompts && <MemberPromptShelf data={data.prompts} compact />}
    {library && data.favorites.recent.length > 0 && <section className="tg-account-group"><h2>{fa ? 'آخرین علاقه‌مندی‌ها' : 'Recent favorites'}</h2><div>{data.favorites.recent.map(item => <Link key={item.url} href={item.url}>{item.image ? <img className="tg-list-thumb" src={item.image} alt="" loading="lazy" /> : <span className="tg-account-icon"><Icon name="heart" size={20} /></span>}<b>{item.title}</b><Icon name="arrow" size={16} /></Link>)}</div></section>}
    {!library && data.orders.recent.length > 0 && <section className="tg-account-group"><h2>{fa ? 'آخرین سفارش‌ها' : 'Recent orders'}</h2><div>{data.orders.recent.map(order => <Link key={order.id} href={data.modules.store ? miniAppHref(order.url) : '/miniapp/payments'}><span className="tg-account-icon"><Icon name="bag" size={20} /></span><span className="tg-order-label"><b>{order.title}</b><small className="num">{formatCurrency(order.total, order.currency, fa ? 'fa-IR' : 'en-US')}</small></span><Icon name="arrow" size={16} /></Link>)}</div></section>}
  </div>
}
