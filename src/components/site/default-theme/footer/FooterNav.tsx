import Link from '@/components/AppLink'
import styles from './Footer.module.css'

export default function FooterNav({ title, links, id }: { title: string; links: { href: string; label: string }[]; id?: string }) {
  if (!links.length) return null
  const entries = Array.from(new Map(links.map(link => [JSON.stringify([link.href, link.label]), link])))
  return <nav className={styles.nav} id={id} aria-label={title}><h3>{title}</h3><ul>{entries.map(([key, link]) => <li key={key}><Link href={link.href}><span>{link.label}</span><span className={styles.linkArrow} aria-hidden="true">↗</span></Link></li>)}</ul></nav>
}
