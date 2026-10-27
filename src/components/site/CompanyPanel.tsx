import Link from '@/components/AppLink'
import NavigationIcon from '@/components/site/NavigationIcon'
import CompanyCopy from '@/components/site/CompanyCopy'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import { companyMapLinks, contactSocialHref, normalizeCompanyContact } from '@/modules/site/domain/company-contact'
import { companyFigures } from '@/modules/site/server/company-figures'
import styles from './company.module.css'

const fa = (value: number) => value.toLocaleString('fa-IR')

/**
 * The company panel of the about and contact pages (chosen per page in Pages admin). About tells the story with what the
 * site really holds, its sections and why people choose it; both show the ways to reach the team and the place on a
 * map with links to the map apps visitors use. Everything comes from Site settings, the menu and the homepage's
 * «چرا موبوکام» section; nothing here is a second store.
 */
export default async function CompanyPanel({ variant }: { variant: 'about' | 'contact' }) {
  const site = await getPublicSiteConfig(), contact = normalizeCompanyContact(site.contact), map = contact.mapEnabled ? companyMapLinks(contact) : null
  const figures = variant === 'about' ? await companyFigures() : []
  const reasons = variant === 'about' ? (site.sections.find((section) => section.kind === 'features' && section.enabled)?.items || []).slice(0, 6) : []
  const sections = variant === 'about' ? site.navigation.filter((link) => link.href !== '/' && link.enabled !== false) : []
  const channels = [
    contact.phone ? { label: 'تماس تلفنی', value: contact.phone, href: 'tel:'+contact.phone.replace(/[^+\d]/g, ''), icon: 'phone' } : null,
    contact.email ? { label: 'ایمیل', value: contact.email, href: 'mailto:'+encodeURIComponent(contact.email).replace(/%40/g, '@'), icon: 'mail' } : null,
    ...(['telegram', 'instagram', 'x'] as const).map(network => contact[network] ? { label: { telegram: 'تلگرام', instagram: 'اینستاگرام', x: 'حساب X' }[network], value: contact[network], href: contactSocialHref(network, contact[network]), icon: network } : null),
  ].filter((row): row is NonNullable<typeof row> => row !== null)
  return <section className={`container ${styles.panel}`} aria-labelledby="company-panel-title">
    {variant === 'about' ? <header className={styles.story}>
      <div className={styles.storyCopy}>
        <span className={styles.eyebrow}>دربارهٔ {site.brand}</span>
        <h2 id="company-panel-title">یک مجموعه، <em>تجربه‌های بیشتر</em></h2>
        <p>{site.tagline.fa}</p>
        <div className={styles.storyActions}><Link href="/products" className="btn btn-primary">شروع از فروشگاه</Link><Link href="/p/contact" className="btn btn-ghost">تماس با ما</Link></div>
      </div>
      {figures.length > 0 && <ul className={styles.figures} aria-label={`${site.brand} در یک نگاه`}>{figures.map((figure) => <li key={figure.label}><Link href={figure.href}><span aria-hidden="true"><NavigationIcon name={figure.icon} size={20} /></span><b>{fa(figure.value)}</b><small>{figure.label}</small></Link></li>)}</ul>}
    </header> : <header className={styles.heading}><div><span className={styles.eyebrow}>{site.brand}</span><h2 id="company-panel-title">با {site.brand} در ارتباط باشید</h2></div><p>برای راهنمایی دربارهٔ سفارش‌ها، حساب کاربری و بخش‌های سایت، از راه‌های ارتباطی زیر استفاده کنید.</p></header>}

    {sections.length > 0 && <section className={styles.block} aria-labelledby="company-sections-title">
      <header className={styles.blockHead}><span className={styles.eyebrow}>همه‌چیز در یک‌جا</span><h3 id="company-sections-title">بخش‌های {site.brand}</h3></header>
      <nav className={styles.explore} aria-label={`بخش‌های ${site.brand}`}>{sections.map((link, index) => <Link href={link.href} key={link.id || link.href} style={{ '--tone': `var(--company-tone-${index % 6})` } as React.CSSProperties}><span className={styles.exploreIcon} aria-hidden="true"><NavigationIcon name={link.icon || 'arrow'} size={22} /></span><span>{link.label.fa}</span><b aria-hidden="true">←</b></Link>)}</nav>
    </section>}

    {reasons.length > 0 && <section className={styles.block} aria-labelledby="company-reasons-title">
      <header className={styles.blockHead}><span className={styles.eyebrow}>چرا {site.brand}</span><h3 id="company-reasons-title">آنچه به آن پایبندیم</h3></header>
      <ul className={styles.reasons}>{reasons.map((reason, index) => <li key={index}><span aria-hidden="true"><NavigationIcon name={reason.icon || 'check'} size={22} /></span><b>{reason.title.fa}</b>{reason.text.fa && <p>{reason.text.fa}</p>}</li>)}</ul>
    </section>}

    <section className={styles.block} aria-labelledby="company-channels-title">
      {variant === 'about' && <header className={styles.blockHead}><span className={styles.eyebrow}>در دسترس شما</span><h3 id="company-channels-title">راه‌های ارتباط</h3></header>}
      {variant === 'contact' && <h3 id="company-channels-title" className="sr-only">راه‌های ارتباط</h3>}
      <div className={styles.channels}>{channels.map(channel => <a href={channel.href} key={channel.label} {...(channel.href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {})}><span className={styles.channelIcon} aria-hidden="true"><NavigationIcon name={channel.icon} size={23} /></span><span><strong>{channel.label}</strong><bdi>{channel.value}</bdi></span><i aria-hidden="true">↗</i></a>)}<Link href="/dashboard/tickets"><span className={styles.channelIcon} aria-hidden="true"><NavigationIcon name="lifebuoy" size={23} /></span><span><strong>مرکز پشتیبانی</strong><small>پیگیری درخواست در حساب کاربری</small></span><i aria-hidden="true">↗</i></Link></div>
    </section>

    {(contact.address || contact.hours || map) && <section className={`${styles.location}${map ? '' : ` ${styles.noMap}`}`} aria-labelledby="company-location-title">
      {map && <figure className={styles.map}>
        <iframe title={`موقعیت ${site.brand} روی نقشه`} src={map.embed} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
        <figcaption>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">مشارکت‌کنندگان OpenStreetMap</a></figcaption>
      </figure>}
      <div className={styles.locationCard}>
        <span className={styles.eyebrow}>موقعیت و دسترسی</span>
        <h3 id="company-location-title">{site.brand}، روی نقشه</h3>
        {contact.address && <address>{contact.address}</address>}
        {contact.hours && <p className={styles.hours}><NavigationIcon name="clock" size={17} /><span><strong>ساعت پاسخ‌گویی</strong> {contact.hours}</span></p>}
        {map && <>
          <a className={`btn btn-primary ${styles.route}`} href={map.directions} target="_blank" rel="noreferrer">مسیریابی با گوگل‌مپ ↗</a>
          <div className={styles.apps} aria-label="باز کردن در برنامهٔ نقشه"><a href={map.neshan} target="_blank" rel="noreferrer">نشان</a><a href={map.balad} target="_blank" rel="noreferrer">بلد</a><a href={map.waze} target="_blank" rel="noreferrer">ویز</a><a href={map.osm} target="_blank" rel="noreferrer">OpenStreetMap</a></div>
        </>}
        <div className={styles.copies}>{contact.address && <CompanyCopy text={contact.address} label="کپی نشانی" className={styles.copy} />}{map && <CompanyCopy text={map.coordinates} label="کپی مختصات" className={styles.copy} />}</div>
      </div>
    </section>}
  </section>
}
