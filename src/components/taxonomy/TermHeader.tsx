import Link from 'next/link'

type TermLink = { id: number; name: string; path: string; count: number }

/**
 * Top of a category archive: breadcrumb (section › parent › term), title,
 * description, item count and the sub-categories (or sibling categories when
 * the term is a leaf) as quick filters.
 */
export default function TermHeader({ section, chain, term, children, siblings, total, itemLabel }: {
  section: { label: string; href: string }
  chain: { id: number; name: string; path: string }[]
  term: { name: string; description: string; color: string; image: string; seoTitle: string }
  children: TermLink[]
  siblings: TermLink[]
  total: number
  itemLabel: string
}) {
  const related = children.length ? children : siblings
  return <header className="tc-head" style={term.color ? { '--tc-accent': term.color } as React.CSSProperties : undefined}>
    <nav className="tc-crumbs" aria-label="مسیر صفحه">
      <Link href={section.href}>{section.label}</Link>
      {chain.slice(0, -1).map((node) => <span key={node.id}><span aria-hidden="true"> / </span><Link href={node.path}>{node.name}</Link></span>)}
      <span aria-hidden="true"> / </span><span aria-current="page">{term.name}</span>
    </nav>
    <div className="tc-title">
      {term.image && <img src={term.image} alt="" className="tc-image" width={72} height={72} />}
      <div>
        <h1>{term.seoTitle || term.name}</h1>
        <p className="tc-count">{total.toLocaleString('fa-IR')} {itemLabel}</p>
      </div>
    </div>
    {term.description && <p className="tc-description">{term.description}</p>}
    {related.length > 0 && <nav className="tc-related" aria-label={children.length ? 'زیردسته‌ها' : 'دسته‌های هم‌سطح'}>
      <span className="tc-related-label">{children.length ? 'زیردسته‌ها' : 'دسته‌های مرتبط'}</span>
      {related.map((node) => <Link key={node.id} href={node.path}>{node.name}<small>{node.count.toLocaleString('fa-IR')}</small></Link>)}
    </nav>}
  </header>
}
