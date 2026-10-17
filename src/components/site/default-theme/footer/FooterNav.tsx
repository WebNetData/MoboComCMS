import Link from '@/components/AppLink'
import styles from './Footer.module.css'
import type { PublicMenuLink } from '@/modules/site/config/menus'
import NavigationIcon from '../../NavigationIcon'

export default function FooterNav({ title, links, id }: { title: string; links: PublicMenuLink[]; id?: string }) {
  if (!links.length) return null
  const entries = Array.from(new Map(links.map(link => [JSON.stringify([link.href, link.label]), link])))
  return <nav className={styles.nav} id={id} aria-label={title}><h3>{title}</h3><ul>{entries.map(([key, link]) => <FooterEntry key={key} link={link} />)}</ul></nav>
}

function FooterEntry({ link }: { link: PublicMenuLink }) { return <li><Link href={link.href}><NavigationIcon name={link.icon} /><span>{link.label}</span><span className={styles.linkArrow} aria-hidden="true">↗</span></Link>{!!link.children?.length && <ul style={{ paddingInlineStart: 14 }}>{link.children.map(child => <FooterEntry key={child.id || child.href + child.label} link={child} />)}</ul>}</li> }
