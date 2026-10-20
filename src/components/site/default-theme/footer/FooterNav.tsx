import Link from '@/components/AppLink'
import styles from './Footer.module.css'
import type { PublicMenuLink } from '@/modules/site/config/menus'
import NavigationIcon from '../../NavigationIcon'

/** How many sub-links a group shows as chips before linking to its own page for the rest. */
const CHIP_LIMIT = 16

/**
 * A footer column of Admin-owned links. Every row has the same three places (icon, label, hover arrow), so links with
 * and without an icon line up. In the `rich` column a link with children becomes a small card: the link itself, then
 * its descendants as chips, instead of one long indented list.
 */
export default function FooterNav({ title, links, id, rich = false, locale = 'fa' }: { title: string; links: PublicMenuLink[]; id?: string; rich?: boolean; locale?: string }) {
  if (!links.length) return null
  const entries = Array.from(new Map(links.map(link => [JSON.stringify([link.href, link.label]), link])))
  return <nav className={`${styles.nav} ${rich ? styles.rich : ''}`} id={id} aria-label={title}>
    <h3>{title}</h3>
    <ul className={rich ? styles.tiles : undefined}>{entries.map(([key, link]) => rich && link.children?.length ? <FooterGroup key={key} link={link} locale={locale} /> : <FooterEntry key={key} link={link} />)}</ul>
  </nav>
}

function FooterRow({ link }: { link: PublicMenuLink }) {
  return <Link href={link.href} className={styles.row}>
    <span className={`${styles.rowIcon} ${link.icon ? '' : styles.rowIconEmpty}`} aria-hidden="true">{link.icon ? <NavigationIcon name={link.icon} size={16} /> : <span className={styles.rowDot} />}</span>
    <span className={styles.rowLabel}>{link.label}</span>
    <span className={styles.linkArrow} aria-hidden="true">↗</span>
  </Link>
}

function FooterEntry({ link }: { link: PublicMenuLink }) {
  return <li><FooterRow link={link} />{!!link.children?.length && <ul className={styles.subList}>{link.children.map(child => <FooterEntry key={child.id || child.href + child.label} link={child} />)}</ul>}</li>
}

/** Every descendant, each followed by its own children: the order the menu editor shows, at any depth. */
const descendants = (link: PublicMenuLink, depth = 1): Array<PublicMenuLink & { depth: number }> => (link.children || []).flatMap(child => [{ ...child, depth }, ...descendants(child, depth + 1)])

function FooterGroup({ link, locale }: { link: PublicMenuLink; locale: string }) {
  const all = descendants(link), shown = all.slice(0, CHIP_LIMIT), more = all.length - shown.length
  return <li className={styles.group}>
    <FooterRow link={link} />
    <ul className={styles.chips} aria-label={link.label}>
      {shown.map(child => <li key={child.id || child.href + child.label}><Link href={child.href} className={`${styles.chip} ${child.depth === 1 ? styles.chipMain : ''}`}>{child.icon ? <NavigationIcon name={child.icon} size={14} /> : null}<span>{child.label}</span></Link></li>)}
      {more > 0 && <li><Link href={link.href} className={`${styles.chip} ${styles.chipMore}`} aria-label={locale === 'fa' ? `${more.toLocaleString('fa-IR')} مورد دیگر در ${link.label}` : `${more} more in ${link.label}`}>+{more.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')}</Link></li>}
    </ul>
  </li>
}
