'use client'
import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'
import { useSite } from '@/components/site/SiteProvider'
import { translate } from '@/modules/site/config/types'
import { PluginOutlet } from '@/plugins/registry'
import Icon from '@/components/site/Icon'
export default function DefaultSiteFooter({ navPages }: { navPages?: { slug: string; title: string; titleEn: string }[] }) {
  const { locale } = useI18n()
  const site = useSite()
  const L = (fa: string, en: string) => locale === 'fa' ? fa : en
  return <><PluginOutlet slot="site.before-footer" site={site} locale={locale}/><footer className="site-footer"><div className="container">
    <div className="footer-wordmark" aria-hidden="true">{site.brand}<span>®</span></div>
    <div className="footer-grid">
      <div><Link href="/" className="footer-brand"><span className="brand-mark"><Icon/></span>{site.brand}</Link><p className="muted mt-4">{translate(site.tagline, locale)}</p></div>
      <div><h3 className="footer-title">{L('کشف کن', 'Explore')}</h3>{site.navigation.map(l => <Link className="footer-link" key={l.href + l.label.fa} href={l.href}>{translate(l.label, locale)}</Link>)}</div>
      <div><h3 className="footer-title">{L('کنار تو', 'Here for you')}</h3>{site.footer.map(l => <Link className="footer-link" key={l.href + l.label.fa} href={l.href}>{translate(l.label, locale)}</Link>)}</div>
      <div><h3 className="footer-title">{L('بیشتر درباره ما', 'More about us')}</h3>{navPages?.map(p => <Link className="footer-link" key={p.slug} href={`/p/${p.slug}`}>{locale === 'fa' ? p.title : p.titleEn || p.title}</Link>)}<p className="muted text-sm">{translate(site.copyright, locale)}</p></div>
    </div><div className="footer-bottom"><span>© {new Date().getFullYear()} {site.brand}</span><span>{translate(site.tagline, locale)} <span className="text-primary-var">↗</span></span></div>
  </div></footer><PluginOutlet slot="site.after-footer" site={site} locale={locale}/></>
}
