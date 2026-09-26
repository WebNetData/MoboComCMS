'use client'

import Link from 'next/link'
import { ThemePluginOutlet, useThemeI18n, useThemeSite } from '@/themes/sdk/client'
import type { ThemeFooterProps } from '@/themes/types'
import Glyph from './glyph'

type LocalText = { fa: string; en: string; [locale: string]: string }
const tx = (value: LocalText, locale: string) => value[locale] || value[locale.split('-')[0]] || value.en || value.fa

export default function OrbitalFooter({ navPages }: ThemeFooterProps) {
  const { locale } = useThemeI18n()
  const site = useThemeSite()
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  return <>
    <ThemePluginOutlet slot="site.before-footer" site={site} locale={locale} />
    <footer className="site-footer orbital-footer">
      <div className="container orbital-footer-shell">
        <div className="orbital-footer-top">
          <Link href="/" className="orbital-footer-brand" aria-label={site.brand}>{site.logo ? <img className="orbital-custom-logo" src={site.logo} alt=""/> : <span className="orbital-brand-mark orbital-h-logo" aria-hidden="true"><i /><i /><b /></span>}<div><strong dir="ltr">{site.brand.endsWith('VPN') ? <>{site.brand.slice(0, -3)}<span>VPN</span></> : site.brand}</strong><p>{tx(site.tagline, locale)}</p></div></Link>
          <p className="orbital-footer-promise"><Glyph name="globe" size={18} />{L('از هر کجا، به دنیای خودت وصل شو.', 'Your world, wherever you are.')}</p>
        </div>
        <div className="orbital-footer-grid">
          <nav aria-label={L('کشف HappVPN', 'Explore HappVPN')}><h3>{L('کشف کنید', 'Explore')}</h3>{site.navigation.map(item => <Link key={item.href} href={item.href} className="orbital-footer-link">{tx(item.label, locale)}</Link>)}</nav>
          <nav aria-label={L('منابع و پشتیبانی', 'Resources and support')}><h3>{L('منابع', 'Resources')}</h3>{site.footer.map(item => <Link key={item.href} href={item.href} className="orbital-footer-link">{tx(item.label, locale)}</Link>)}{navPages?.map(page => <Link key={page.slug} href={`/p/${page.slug}`} className="orbital-footer-link">{locale === 'fa' ? page.title : page.titleEn || page.title}</Link>)}</nav>
          <nav aria-label={L('حساب کاربری', 'Your account')}><h3>{L('حساب شما', 'Your account')}</h3><Link href="/dashboard" className="orbital-footer-link">{L('اشتراک‌های من', 'My subscriptions')}</Link><Link href="/dashboard/orders" className="orbital-footer-link">{L('سفارش‌ها', 'Orders')}</Link><Link href="/dashboard/wallet" className="orbital-footer-link">{L('کیف پول', 'Wallet')}</Link><Link href="/dashboard/profile" className="orbital-footer-link">{L('تنظیمات حساب', 'Account settings')}</Link></nav>
          <div className="orbital-footer-help"><span className="orbital-footer-help-icon"><Glyph name="chat" size={23} /></span><h3>{L('در کنارت هستیم.', 'A little help goes a long way.')}</h3><p>{L('سؤالی درباره پلن یا اتصال داری؟ از پنل کاربری با ما در ارتباط باش.', 'Questions about your plan or connection? Reach our team from your dashboard.')}</p><Link href="/dashboard/tickets">{L('ارتباط با پشتیبانی', 'Contact support')} <span aria-hidden="true">↗</span></Link></div>
        </div>
        <div className="orbital-footer-bottom"><span dir="ltr">© {new Date().getFullYear()} {site.brand}</span><span>{tx(site.copyright, locale)}</span><span className="orbital-footer-language"><Glyph name="globe" size={15} />{locale === 'fa' ? 'فارسی / English' : 'English / فارسی'}</span></div>
      </div>
    </footer>
    <ThemePluginOutlet slot="site.after-footer" site={site} locale={locale} />
  </>
}
