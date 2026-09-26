import Link from 'next/link'
import type { ReactNode } from 'react'

/** Shared presentation only: content and commerce remain owned by their modules. */
export function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: ReactNode }) {
  return <header className="content-intro"><div><span className="content-eyebrow"><i />{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="content-intro-aside">{children}</div>}</header>
}

export function Breadcrumbs({ items, label }: { items: { label: string; href?: string }[]; label: string }) {
  return <nav className="content-breadcrumbs" aria-label={label}><ol>{items.map((item, index) => <li key={index}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>
}

export function ContentArt({ kind = 'article' }: { kind?: 'article' | 'product' }) {
  return <div className={`content-art content-art-${kind}`} aria-hidden="true"><div className="content-art-grid" /><svg viewBox="0 0 120 120" fill="none"><rect x="24" y="18" width="72" height="84" rx="16" stroke="currentColor" strokeWidth="1.5" />{kind === 'article' ? <><path d="M40 40h40M40 52h28M40 78h40M40 88h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="77" cy="65" r="4" fill="currentColor"/></> : <><path d="m60 35 22 12v26L60 86 38 73V47l22-12Z M38 47l22 13 22-13M60 60v26" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></>}</svg><span>{kind === 'article' ? 'JOURNAL / HAPPVPN' : 'COLLECTION / HAPPVPN'}</span></div>
}
