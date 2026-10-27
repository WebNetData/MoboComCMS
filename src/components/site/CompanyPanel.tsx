import Link from '@/components/AppLink'
import NavigationIcon from '@/components/site/NavigationIcon'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import { companyMapLinks, contactSocialHref, normalizeCompanyContact } from '@/modules/site/domain/company-contact'
import styles from './company.module.css'

export default async function CompanyPanel({ variant }: { variant: 'about' | 'contact' }) {
  const site = await getPublicSiteConfig(), contact = normalizeCompanyContact(site.contact), map = contact.mapEnabled ? companyMapLinks(contact) : null
  const channels = [
    contact.phone ? { label: 'تماس تلفنی', value: contact.phone, href: 'tel:'+contact.phone.replace(/[^+\d]/g, ''), icon: 'phone' } : null,
    contact.email ? { label: 'ایمیل', value: contact.email, href: 'mailto:'+encodeURIComponent(contact.email).replace(/%40/g, '@'), icon: 'mail' } : null,
    ...(['telegram', 'instagram', 'x'] as const).map(network => contact[network] ? { label: { telegram: 'تلگرام', instagram: 'اینستاگرام', x: 'حساب X' }[network], value: contact[network], href: contactSocialHref(network, contact[network]), icon: network } : null),
  ].filter((row): row is NonNullable<typeof row> => row !== null)
  return <section className={`container ${styles.panel}`} aria-labelledby="company-panel-title">
    <header className={styles.heading}><div><span>{site.brand}</span><h2 id="company-panel-title">{variant === 'about' ? 'یک مجموعه، تجربه‌های بیشتر' : 'با موبوکام در ارتباط باشید'}</h2></div><p>{variant === 'about' ? site.tagline.fa : 'برای راهنمایی دربارهٔ سفارش‌ها، حساب کاربری و بخش‌های سایت، از راه‌های ارتباطی زیر استفاده کنید.'}</p></header>
    {variant === 'about' && <nav className={styles.explore} aria-label="بخش‌های موبوکام">{site.navigation.filter(link => link.href !== '/').map(link => <Link href={link.href} key={link.id || link.href}><NavigationIcon name={link.icon || 'arrow'} size={20} /><span>{link.label.fa}</span><b aria-hidden="true">↗</b></Link>)}</nav>}
    <div className={styles.channels}>{channels.map(channel => <a href={channel.href} key={channel.label} {...(channel.href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {})}><span className={styles.channelIcon} aria-hidden="true"><NavigationIcon name={channel.icon} size={23} /></span><span><strong>{channel.label}</strong><bdi>{channel.value}</bdi></span><i aria-hidden="true">↗</i></a>)}<Link href="/dashboard/tickets"><span className={styles.channelIcon} aria-hidden="true"><NavigationIcon name="lifebuoy" size={23} /></span><span><strong>مرکز پشتیبانی</strong><small>پیگیری درخواست در حساب کاربری</small></span><i aria-hidden="true">↗</i></Link></div>
    {(contact.address || contact.hours || contact.mapEnabled && map) && <div className={styles.location}>
      <div className={styles.address}><span className={styles.eyebrow}>موقعیت و دسترسی</span><h3>موبوکام، روی نقشه</h3>{contact.address && <address>{contact.address}</address>}{contact.hours && <div><strong>ساعت پاسخ‌گویی</strong><p>{contact.hours}</p></div>}{map && <div className={styles.directions}><a className="btn btn-primary" href={map.directions} target="_blank" rel="noreferrer">مسیریابی با گوگل ↗</a><a href={map.google} target="_blank" rel="noreferrer">نمایش پین</a></div>}</div>
      {contact.mapEnabled && map && <figure className={styles.map}><iframe title={`موقعیت ${site.brand} روی نقشه`} src={map.embed} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" /><figcaption>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">مشارکت‌کنندگان OpenStreetMap</a> · پین محل موبوکام</figcaption></figure>}
    </div>}
  </section>
}
