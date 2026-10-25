'use client'

import { useId } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { useSite } from '@/components/site/SiteProvider'
import { translate } from '@/modules/site/config/types'
import { PluginOutlet } from '@/plugins/registry'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { toPublicPath } from '@/platform/routing/aliases'
import type { ThemeFooterProps } from '@/themes/types'
import Icon from '@/components/site/Icon'
import { Wordmark } from '@/components/site/SiteLogo'
import TrustSeals from '@/components/site/TrustSeals'
import FooterNav from './footer/FooterNav'
import { DEFAULT_FOOTER_ACCOUNT, localizeMenu } from '@/modules/site/config/menus'
import FooterBackToTop from './footer/FooterBackToTop'
import styles from './footer/Footer.module.css'

/** Canonical default/MoboCom footer; brand, links and seals retain their existing Admin owners. */
export default function DefaultSiteFooter({ navPages }: ThemeFooterProps) {
  const { locale } = useI18n(), site = useSite(), searchEnabled = useModuleEnabled('search'), titleId = useId(), sectionsId = useId(), searchId = useId()
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  const links = (items: typeof site.footer) => localizeMenu(items, locale)
  const resources = [...links(site.footer), ...(navPages || []).map(page => ({ href: `/p/${page.slug}`, label: locale === 'fa' ? page.title : page.titleEn || page.title }))]
  const seen = new Set<string>()
  const uniqueResources = resources.filter(item => { if (seen.has(item.href)) return false; seen.add(item.href); return true })
  const account = links(site.footerAccount ?? DEFAULT_FOOTER_ACCOUNT)
  return <>
    <PluginOutlet slot="site.before-footer" site={site} locale={locale} />
    <footer className={`site-footer ${styles.footer}`} aria-label={L('پایین صفحه', 'Site footer')} data-testid="site-footer">
      <div className={styles.shell}>
        <div className={styles.ambient} aria-hidden="true"><span /><span /><span /></div>
        <section className={styles.intro} aria-labelledby={titleId}>
          <div className={styles.introCopy}><span className={styles.eyebrow}><Icon name="sparkles" size={17} />{L('جایی برای کشف‌های تازه', 'A place for new discoveries')}</span><h2 id={titleId}>{L('دنیای دیجیتال،', 'Your digital world,')}<span>{L('نزدیک‌تر از همیشه.', 'closer than ever.')}</span></h2><p>{translate(site.copyright, locale)}</p></div>
          <div className={styles.introActions}>{(site.footerExplore ?? site.navigation).length > 0 && <Link href={`#${sectionsId}`} className={styles.explore}>{L('مسیرت را پیدا کن', 'Find your next discovery')}<Icon name="arrow" size={19} /></Link>}<Link href="/dashboard" className={styles.accountLink}><Icon name="user" size={17} />{L('حساب کاربری شما', 'Your account')}</Link></div>
        </section>
        <div className={styles.grid}>
          <div className={styles.identity}>
            <Link href="/" className={styles.brand} aria-label={site.brand} translate="no">
              {site.wordmark ? <Wordmark height={48} className={styles.wordmark} lazy /> : <><span className={styles.mark} aria-hidden="true">{site.logo ? <img src={site.logo} alt="" width={44} height={44} loading="lazy" decoding="async" /> : site.brand.trim().slice(0, 1)}</span><strong>{site.brand}</strong></>}
            </Link>
            <p className={styles.tagline}>{translate(site.tagline, locale)}</p>
            {searchEnabled && <form action={toPublicPath('/search')} method="get" role="search" aria-label={L('جست‌وجو از پایین صفحه', 'Search from the footer')} className={styles.search}><label htmlFor={searchId}>{L('دنبال چه می‌گردید؟', 'What are you looking for?')}</label><div className={styles.searchControl}><input id={searchId} name="q" type="search" required minLength={2} maxLength={100} autoComplete="off" placeholder={L('نام آهنگ، بازی یا مطلب…', 'Music, games or articles…')} /><button type="submit" aria-label={L('جست‌وجو در سایت', 'Search the site')}><Icon name="search" size={19} /></button></div></form>}
            <span className={styles.signature}><span aria-hidden="true" />{L('یک حساب، همهٔ بخش‌ها', 'One account, every section')}</span>
          </div>
          <FooterNav id={sectionsId} rich locale={locale} title={L('دنیای موبوکام', 'Explore')} links={links(site.footerExplore ?? site.navigation)} />
          <FooterNav title={L('راهنما و همراهی', 'Help & resources')} links={uniqueResources} />
          <div className={styles.accountColumn}><FooterNav title={L('فضای شخصی شما', 'Your space')} links={account} /><div className={styles.help}><span className={styles.helpIcon}><Icon name="chat" size={22} /></span><h3>{L('گفت‌وگو را شروع کنیم؟', 'Let’s talk.')}</h3><p>{L('سؤالتان را از پنل کاربری با تیم پشتیبانی در میان بگذارید.', 'Send your question to our support team from your dashboard.')}</p><Link href="/dashboard/tickets">{L('ارتباط با پشتیبانی', 'Contact support')}<Icon name="arrow" size={17} /></Link></div></div>
        </div>
        <TrustSeals className={styles.seals} />
        <div className={styles.bottom}><div className={styles.legal}><span>© {site.footerYear && <bdi>{site.footerYear}</bdi>} <b translate="no">{site.brand}</b></span><span>{L('همراه لحظه‌های دیجیتال شما.', 'For your everyday digital life.')}</span></div><FooterBackToTop label={L('بازگشت به بالا', 'Back to top')} /></div>
        <div className={styles.wordArt} aria-hidden="true" translate="no">{site.brand}</div>
      </div>
    </footer>
    <PluginOutlet slot="site.after-footer" site={site} locale={locale} />
  </>
}
