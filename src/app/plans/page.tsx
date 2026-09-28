import Link from '@/components/AppLink'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { isModuleEnabled, requireModule } from '@/extensions/server/modules'
import PlanCards from '@/components/PlanCards'
import { getSettings } from '@/modules/settings/server'
import { getPublicPlans } from '@/modules/catalog/server/public-plans'
import { getPublicNavigationPages } from '@/modules/site/server/navigation'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { formatAmount } from '@/shared/money/format'
import { resolveUsdTomanRateNumber } from '@/modules/billing/domain/rates'
import { planName } from '@/modules/catalog/domain/plan-locale'
import { trialPolicy } from '@/modules/trials/server/trials'
import { getPublicOffers } from '@/modules/offers/server/offers'
import { legacyNumber } from '@/shared/money'
import { getViewer } from '@/modules/membership/server/membership'

export const dynamic = 'force-dynamic'

export default async function PlansPage() {
  await requireModule('vpn')
  const [plans, locale, theme, settings, trial, offers] = await Promise.all([
    getPublicPlans(),
    getServerLocale(),
    getServerTheme(),
    getSettings(),
    trialPolicy(),
    getPublicOffers(),
  ])
  const [navPages, viewer, vipOn] = await Promise.all([getPublicNavigationPages(), getViewer(), isModuleEnabled('membership')])
  const t = dict(locale)
  const tomanRate = resolveUsdTomanRateNumber(settings.usdRateToman, process.env.FRENZYEX_USD_RATE_TOMAN)

  const faqs: [string, string][] = [
    [t.faqPayQ, t.faqPayA],
    [t.faqWhenQ, t.faqWhenA],
    [t.faqAppsQ, t.faqAppsA],
  ]

  return (
    <>
      <ThemeHeader context={{ route: 'other' }} theme={theme} locale={locale} navPages={navPages} />
      <main className="container page-main">
        <div className="section-head">
          <div className="eyebrow">⚡ {t.planPricing}</div>
          <h1 className="display mt-4">{t.plansTitle}</h1>
          <p className="lead mt-3">{t.plansSub}</p>
        </div>

        <PlanCards plans={plans} tomanRate={tomanRate} vip={vipOn ? { member: viewer.member } : undefined} />

        {offers.length > 0 && <section className="section"><div className="section-head"><div className="eyebrow">{locale === 'fa' ? 'فروش حجمی و نامحدود' : 'Volume & unlimited'}</div><h2 className="display-sm mt-3">{locale === 'fa' ? 'حجم مناسب خودت را انتخاب کن' : 'Choose the volume you need'}</h2></div><div className="grid-auto">{offers.map(offer => <article className="tile" key={offer.id}><span className="content-eyebrow">{offer.trafficGB ? `${offer.trafficGB} GB` : locale === 'fa' ? 'نامحدود' : 'Unlimited'}</span><h3 className="h3 mt-3">{locale === 'fa' ? offer.nameFa : offer.nameEn}</h3><p className="muted mt-2">{offer.days} {locale === 'fa' ? 'روز' : 'days'} · {offer.deviceLimit} {locale === 'fa' ? 'دستگاه' : 'devices'}</p><strong className="checkout-price" dir="ltr">{formatAmount(legacyNumber(offer.priceMinor, offer.currency), offer.currency, locale === 'fa' ? 'fa-IR' : 'en-US')}</strong><Link href={`/checkout?offerId=${offer.id}`} className="btn btn-primary mt-4">{locale === 'fa' ? 'انتخاب سرویس' : 'Choose service'}</Link></article>)}</div></section>}

        {trial.enabled && <div className="card mt-8" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}><div><strong className="h3">{locale === 'fa' ? 'قبل از خرید، اتصال را امتحان کنید' : 'Try the connection before you buy'}</strong><p className="muted mt-2">{trial.trafficGB} GB · {trial.days * 24} {locale === 'fa' ? 'ساعت' : 'hours'} · {locale === 'fa' ? 'یک‌بار برای هر حساب' : 'once per account'}</p></div><Link href="/trial" className="btn btn-primary">{locale === 'fa' ? 'شروع تریال' : 'Start trial'}</Link></div>}

        <div className="grid-auto mt-8">
          {[
            ['🚀', t.instantActivation, t.why4d],
            ['🛡', t.securePayment, t.faqPayA],
            ['💬', t.support, t.why3d],
          ].map(([icon, title, desc]) => (
            <div key={title} className="tile flex items-start gap-3">
              <div className="tile-icon" style={{ marginBottom: 0 }}>{icon}</div>
              <div>
                <div className="tile-title">{title}</div>
                <p className="muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {plans.length > 1 && (
          <section className="section">
            <div className="section-head">
              <h2 className="display-sm">{t.comparison}</h2>
            </div>
            <div className="card compare-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>{t.plan}</th>
                    <th>{t.bandwidth}</th>
                    <th>{t.duration}</th>
                    <th>{t.devices}</th>
                    <th>{t.amount}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">
                        {planName(p, locale)} {p.featured && <span className="badge badge-purple">★</span>}
                      </td>
                      <td className="num">{p.trafficGB} GB</td>
                      <td className="num">{p.days} {t.days}</td>
                      <td className="num">{p.deviceLimit}</td>
                      <td className="num font-semibold">{formatAmount(p.price, p.currency, locale === 'fa' ? 'fa-IR' : 'en-US')}</td>
                      <td>
                        <Link href="/register" className="badge badge-purple">{t.choosePlan}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="display-sm">{t.faq}</h2>
          </div>
          <div className="grid-2">
            {faqs.map(([q, a]) => (
              <div key={q} className="tile">
                <div className="tile-title">{q}</div>
                <p className="muted leading-7">{a}</p>
              </div>
            ))}
            <div className="tile">
              <div className="tile-title">{t.allPlansInclude}</div>
              <ul className="feature-list mt-2">
                {[t.instantActivation, t.securePayment, t.guarantee, t.trustedBy].map((f) => (
                  <li key={f} className="feature-item"><span className="feature-check">✓</span> {f}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="section-tight">
          <div className="card cta-band text-center">
            <h2 className="display-sm">{t.heroTitleA} MoboComCMS</h2>
            <p className="lead mt-2">{t.trust}</p>
            <div className="flex justify-center gap-3 mt-5 flex-wrap">
              <Link href="/register" className="btn btn-primary">{t.createAccount}</Link>
              <Link href="/products" className="btn btn-ghost">{t.shop}</Link>
            </div>
          </div>
        </section>
      </main>
      <ThemeFooter context={{ route: 'other' }} locale={locale} navPages={navPages} />
    </>
  )
}
