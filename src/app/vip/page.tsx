import type { Metadata } from 'next'
import Link from 'next/link'
import { isModuleEnabled, requireModule } from '@/extensions/server/modules'
import { getViewer, getVipPlans } from '@/modules/membership/server/membership'
import { daysLeft } from '@/modules/membership/domain/membership'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import VipPlans from '@/components/media/VipPlans'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const fa = (await getServerLocale()) === 'fa'
  return { title: fa ? 'اشتراک ویژه VIP' : 'VIP membership', description: fa ? 'با اشتراک ویژه به همه فیلم‌ها، سریال‌ها، آهنگ‌ها و بازی‌های ویژه، کیفیت بالاتر و قیمت مخصوص اعضا دسترسی داشته باشید.' : 'Unlock every members-only film, series, song and game, higher quality and member prices.', alternates: { canonical: '/vip' } }
}

export default async function VipPage() {
  await requireModule('membership')
  const landing = await sectionLanding('vip')
  if (landing) return landing
  const [locale, viewer, plans, music, cinema, games, store, journal] = await Promise.all([getServerLocale(), getViewer(), getVipPlans(), isModuleEnabled('music'), isModuleEnabled('cinema'), isModuleEnabled('games'), isModuleEnabled('store'), isModuleEnabled('journal')])
  const fa = locale === 'fa'
  const currencies = [...new Set(plans.map((plan) => plan.currency))]
  const gatewayLists = await Promise.all(currencies.map((currency) => checkoutGatewayOptions(currency).catch(() => [])))
  const gateways = Object.fromEntries(currencies.map((currency, i) => [currency, gatewayLists[i]]))
  const left = daysLeft(viewer.endsAt)
  const benefits = [
    cinema && { icon: '🎬', title: fa ? 'فیلم و سریال ویژه' : 'Exclusive films & series', text: fa ? 'دسترسی به عنوان‌ها و قسمت‌های مخصوص اعضا با همه کیفیت‌ها' : 'Members-only titles and episodes in every quality', href: '/cinema' },
    music && { icon: '🎧', title: fa ? 'موزیک با کیفیت ۳۲۰' : '320 kbps music', text: fa ? 'پخش و دانلود با بالاترین کیفیت و آهنگ‌های اختصاصی' : 'Stream and download in top quality, plus exclusive tracks', href: '/music' },
    games && { icon: '🎮', title: fa ? 'بازی‌های ویژه' : 'VIP games', text: fa ? 'لینک مستقیم بازی‌هایی که فقط برای اعضا منتشر می‌شوند' : 'Direct links to games released for members', href: '/games' },
    store && { icon: '🏷', title: fa ? 'قیمت ویژه اعضا' : 'Member prices', text: fa ? 'محصولات و پلن‌ها با قیمت کمتر و کدهای تخفیف اختصاصی' : 'Lower prices and exclusive discount codes', href: '/products' },
    journal && { icon: '📰', title: fa ? 'مطالب ویژه مجله' : 'Premium articles', text: fa ? 'خواندن کامل مقاله‌ها و آموزش‌های مخصوص اعضا' : 'Read members-only articles and guides in full', href: '/blog' },
    { icon: '⚡', title: fa ? 'فعال‌سازی فوری' : 'Instant activation', text: fa ? 'پرداخت با کیف پول یا درگاه؛ روزهای جدید روی اشتراک فعلی اضافه می‌شود' : 'Pay with wallet or gateway; new days stack on top', href: '' },
  ].filter(Boolean) as { icon: string; title: string; text: string; href: string }[]
  const faqs: [string, string][] = fa ? [
    ['اشتراک ویژه چطور فعال می‌شود؟', 'بلافاصله بعد از پرداخت موفق، عضویت شما فعال می‌شود و نشان VIP در حساب کاربری‌تان نمایش داده می‌شود.'],
    ['اگر قبل از پایان اشتراک تمدید کنم چه می‌شود؟', 'هیچ روزی از دست نمی‌رود؛ روزهای جدید به انتهای اشتراک فعلی اضافه می‌شود.'],
    ['آیا می‌توانم VIP را هدیه بگیرم؟', 'بله، برخی پلن‌های VPN و محصولات فروشگاه چند روز VIP هدیه دارند که بعد از خرید خودکار اضافه می‌شود.'],
    ['روش پرداخت چیست؟', 'ابتدا از موجودی کیف پول استفاده می‌شود و باقی مبلغ با درگاه‌های فعال سایت پرداخت می‌شود.'],
  ] : [
    ['How is VIP activated?', 'Right after a successful payment your membership is active and the VIP badge shows on your account.'],
    ['What if I renew early?', 'You never lose days — new days are added after your current period.'],
    ['Can I get VIP as a gift?', 'Yes. Some VPN plans and store products include bonus VIP days, added automatically after purchase.'],
    ['How do I pay?', 'Your wallet balance is used first; any remainder goes through the site’s active payment gateways.'],
  ]

  return (
    <MediaShell section="vip">
      <section className="vip-hero">
        <div className="vip-hero-glow" aria-hidden="true" />
        <div className="container vip-hero-inner">
          <span className="vip-hero-crown" aria-hidden="true">♛</span>
          <span className="md-eyebrow">{fa ? 'اشتراک ویژه' : 'Membership'}</span>
          <h1>{fa ? 'همه چیز، بدون محدودیت' : 'Everything. No limits.'}</h1>
          <p>{fa ? 'یک اشتراک برای فیلم، سریال، موزیک، بازی، مطالب ویژه و قیمت‌های مخصوص اعضا.' : 'One membership for films, series, music, games, premium articles and member-only prices.'}</p>
          {viewer.member ? (
            <div className="vip-status is-active"><b>♛ {fa ? 'شما عضو ویژه هستید' : 'You are a VIP member'}</b><span>{fa ? `${left.toLocaleString('fa-IR')} روز باقی‌مانده · تا ${viewer.endsAt ? new Date(viewer.endsAt).toLocaleDateString('fa-IR') : ''}` : `${left} days left · until ${viewer.endsAt ? new Date(viewer.endsAt).toLocaleDateString('en-US') : ''}`}</span></div>
          ) : viewer.userId ? null : (
            <div className="vip-status"><span>{fa ? 'قبلاً عضو شده‌اید؟' : 'Already a member?'}</span><Link href={`/login?next=${encodeURIComponent('/vip')}`}>{fa ? 'وارد شوید' : 'Sign in'}</Link></div>
          )}
        </div>
      </section>
      <div className="container md-body">
        <section className="vip-section" id="plans">
          <header className="vip-section-head"><h2>{viewer.member ? (fa ? 'تمدید اشتراک' : 'Extend your membership') : (fa ? 'پلن خود را انتخاب کنید' : 'Choose your plan')}</h2></header>
          <VipPlans plans={plans} gateways={gateways} member={viewer.member} />
        </section>
        <section className="vip-section">
          <header className="vip-section-head"><h2>{fa ? 'با VIP چه چیزهایی باز می‌شود؟' : 'What VIP unlocks'}</h2></header>
          <div className="vip-benefits">
            {benefits.map((b) => {
              const body = <><span className="vip-benefit-icon" aria-hidden="true">{b.icon}</span><b>{b.title}</b><p>{b.text}</p></>
              return b.href ? <Link key={b.title} href={b.href} className="vip-benefit">{body}</Link> : <div key={b.title} className="vip-benefit">{body}</div>
            })}
          </div>
        </section>
        <section className="vip-section">
          <header className="vip-section-head"><h2>{fa ? 'پرسش‌های رایج' : 'FAQ'}</h2></header>
          <div className="vip-faq">{faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </section>
      </div>
    </MediaShell>
  )
}
