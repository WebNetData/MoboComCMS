import Link from '@/components/AppLink'
import NavigationIcon from '@/components/site/NavigationIcon'
import CompanyCopy from './CompanyCopy'
import { getPublicSiteConfig } from '@/modules/site/config/store'
import { companyMapLinks, contactSocialHref, normalizeCompanyContact } from '@/modules/site/domain/company-contact'
import styles from './company.module.css'

export type CompanyChannel = { label: string; value: string; href: string; icon: string; external: boolean }

/** The site, its contact details, the map links when a pin is set and the ways to reach the team, read once per page. */
export async function companyData() {
  const site = await getPublicSiteConfig(), contact = normalizeCompanyContact(site.contact)
  const map = contact.mapEnabled ? companyMapLinks(contact) : null
  const channels: CompanyChannel[] = [
    contact.phone ? { label: 'تماس تلفنی', value: contact.phone, href: 'tel:'+contact.phone.replace(/[^+\d]/g, ''), icon: 'phone', external: false } : null,
    contact.email ? { label: 'ایمیل', value: contact.email, href: 'mailto:'+encodeURIComponent(contact.email).replace(/%40/g, '@'), icon: 'mail', external: false } : null,
    ...(['telegram', 'instagram', 'x'] as const).map(network => contact[network] ? { label: { telegram: 'تلگرام', instagram: 'اینستاگرام', x: 'حساب X' }[network], value: contact[network], href: contactSocialHref(network, contact[network]), icon: network, external: true } : null),
  ].filter((row): row is CompanyChannel => row !== null)
  return { site, contact, map, channels }
}

/** The ways to reach the team, ending with the support centre; laid out as a grid (about) or a stack (contact). */
export function Channels({ channels, layout = 'grid' }: { channels: CompanyChannel[]; layout?: 'grid' | 'stack' }) {
  return <div className={layout === 'stack' ? styles.channelStack : styles.channels}>
    {channels.map(channel => <a href={channel.href} key={channel.label} className={styles.channel} data-kind={channel.icon} {...(channel.external ? { target: '_blank', rel: 'noreferrer' } : {})}><span className={styles.channelIcon} aria-hidden="true"><NavigationIcon name={channel.icon} size={22} /></span><span className={styles.channelText}><strong>{channel.label}</strong><bdi>{channel.value}</bdi></span><i aria-hidden="true">↗</i></a>)}
    <Link href="/dashboard/tickets" className={styles.channel} data-kind="support"><span className={styles.channelIcon} aria-hidden="true"><NavigationIcon name="lifebuoy" size={22} /></span><span className={styles.channelText}><strong>مرکز پشتیبانی</strong><small>ثبت و پیگیری درخواست در حساب کاربری</small></span><i aria-hidden="true">↗</i></Link>
  </div>
}

/** The place: a large map (OSM embed, darkened with the dark theme) with a floating card and links to map apps. */
export function Location({ data, size = 'large', headingId }: { data: Awaited<ReturnType<typeof companyData>>; size?: 'large' | 'band'; headingId: string }) {
  const { site, contact, map } = data
  if (!contact.address && !contact.hours && !map) return null
  return <section className={`${styles.location}${size === 'band' ? ` ${styles.band}` : ''}${map ? '' : ` ${styles.noMap}`}`} aria-labelledby={headingId}>
    {map && <figure className={styles.map}>
      <iframe title={`موقعیت ${site.brand} روی نقشه`} src={map.embed} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
      <figcaption>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">مشارکت‌کنندگان OpenStreetMap</a></figcaption>
    </figure>}
    <div className={styles.locationCard}>
      <span className={styles.eyebrow}>موقعیت و دسترسی</span>
      <h2 id={headingId}>{site.brand}، روی نقشه</h2>
      {contact.address && <address>{contact.address}</address>}
      {contact.hours && <p className={styles.hours}><NavigationIcon name="clock" size={17} /><span><strong>ساعت پاسخ‌گویی</strong> {contact.hours}</span></p>}
      {map && <>
        <a className={`btn btn-primary ${styles.route}`} href={map.directions} target="_blank" rel="noreferrer">مسیریابی با گوگل‌مپ ↗</a>
        <div className={styles.apps} aria-label="باز کردن در برنامهٔ نقشه"><a href={map.neshan} target="_blank" rel="noreferrer">نشان</a><a href={map.balad} target="_blank" rel="noreferrer">بلد</a><a href={map.waze} target="_blank" rel="noreferrer">ویز</a><a href={map.osm} target="_blank" rel="noreferrer">OpenStreetMap</a></div>
      </>}
      <div className={styles.copies}>{contact.address && <CompanyCopy text={contact.address} label="کپی نشانی" className={styles.copy} />}{map && <CompanyCopy text={map.coordinates} label="کپی مختصات" className={styles.copy} />}</div>
    </div>
  </section>
}
