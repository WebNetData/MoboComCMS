import Link from '@/components/AppLink'
import styles from './Footer.module.css'
import type { PublicMenuLink } from '@/modules/site/config/menus'
import NavigationIcon from '../../NavigationIcon'
import { sectionIcon } from '../../section-icons'


/**
 * A footer column of Admin-owned links. Every row has the same three places (icon, label, hover arrow), so links with
 * and without an icon line up. The `rich` column (the site's sections) is a grid of tiles: each section once, with its
 * icon and how many parts it has (owner, 2026-10-28: "the footer is far too long" — the sub-menus live in the header
 * and the section bars, not printed in full here).
 */
export default function FooterNav({ title, links, id, rich = false, locale = 'fa' }: { title: string; links: PublicMenuLink[]; id?: string; rich?: boolean; locale?: string }) {
  if (!links.length) return null
  const entries = Array.from(new Map(links.map(link => [JSON.stringify([link.href, link.label]), link])))
  return <nav className={`${styles.nav} ${rich ? styles.rich : ''}`} id={id} aria-label={title}>
    <h3>{title}</h3>
    <ul className={rich ? styles.tiles : undefined}>{entries.map(([key, link]) => rich ? <FooterTile key={key} link={link} locale={locale} /> : <FooterEntry key={key} link={link} />)}</ul>
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

/** A section as a tile: its icon, its name and how many parts it has. */
function FooterTile({ link, locale }: { link: PublicMenuLink; locale: string }) {
  const parts = link.children?.length || 0
  return <li><Link href={link.href} className={styles.tile}>
    <span className={styles.tileIcon} aria-hidden="true"><NavigationIcon name={sectionIcon(link.href, link.icon)} size={18} /></span>
    <span className={styles.tileText}><b>{link.label}</b>{parts > 0 && <small>{locale === 'fa' ? `${parts.toLocaleString('fa-IR')} بخش` : `${parts} parts`}</small>}</span>
  </Link></li>
}
