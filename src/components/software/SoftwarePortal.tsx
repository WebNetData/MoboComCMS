import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import { sized, srcSet } from '@/shared/media/image'
import { licenseLabel } from '@/modules/media/domain/media'
import type { SoftwareCard, SoftwareTree } from '@/modules/media/server/queries'
import { VipBadge } from '@/components/media/MediaCards'

// Download portal in the Softgozar layout: a stats strip, coloured category
// tiles, list cards with a spec table, icon shelves and a suggestions sidebar.

const num = (value: number, fa = true) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
const day = (value: Date | null, fa = true) => (value ? new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—')
export const isFresh = (value: Date) => Date.now() - new Date(value).getTime() < 3 * 86_400_000
export const softwareName = (item: Pick<SoftwareCard, 'title' | 'titleEn'>, fa: boolean) => (fa ? item.title : item.titleEn || item.title)

export { Icon, platformIcon, type IconName } from '@/components/media/PortalIcons'
import { Icon, platformIcon, type IconName } from '@/components/media/PortalIcons'

// ------------------------------------------------------------------ page chrome

export function SoftwareLayout({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
  return <div className="container sp-layout"><div className="sp-main">{children}</div><aside className="sp-aside" aria-label="ستون کناری">{sidebar}</aside></div>
}

export type PortalStats = { count: number; traffic: number; downloads: number; updatedAt: Date | null; reviews: number; categories: number }

/** Counters under the section menu (catalogue size, traffic, last update, categories, reviews). */
export function SoftwareStatsStrip({ stats }: { stats: PortalStats }) {
  const items: [IconName, string, string][] = [
    ['apps', 'تعداد برنامه‌ها', num(stats.count)],
    ['download', 'مشاهده و دانلود', num(stats.traffic)],
    ['refresh', 'آخرین به‌روزرسانی', day(stats.updatedAt)],
    ['folder', 'دسته‌بندی‌ها', num(stats.categories)],
    ['chat', 'نظرات کاربران', num(stats.reviews)],
  ]
  return <div className="sp-stats"><ul className="container">{items.map(([icon, label, value]) => <li key={label}><Icon name={icon} size={18} /><span>{label}:</span><b>{value}</b></li>)}</ul></div>
}

export type Tile = { key: string; name: string; path: string; count: number; color: string }
const TILE_COLORS = ['#4c6ef5', '#f76707', '#37b24d', '#7048e8', '#e03131', '#1098ad', '#d6336c']

/** Coloured category tiles (the highlighted categories of the portal). */
export function CategoryTiles({ tiles }: { tiles: Tile[] }) {
  if (!tiles.length) return null
  return <nav className="sp-tiles" aria-label="دسته‌های پرطرفدار">{tiles.map((tile, index) => {
    const color = tile.color || TILE_COLORS[index % TILE_COLORS.length]
    return <Link key={tile.key} href={tile.path} className="sp-tile" style={{ '--tile': color } as React.CSSProperties}>
      <span className="sp-tile-icon"><Icon name={platformIcon(tile.name)} size={30} /></span>
      <span className="sp-tile-text"><b>{tile.name}</b><small>{num(tile.count)} برنامه</small></span>
    </Link>
  })}</nav>
}

/** Sub-categories as folder tiles (category pages). */
export function FolderTiles({ items }: { items: { id: number; name: string; path: string; count: number }[] }) {
  if (!items.length) return null
  return <nav className="sp-folders" aria-label="زیردسته‌ها">{items.map((item) => <Link key={item.id} href={item.path} className="sp-folder">
    <span className="sp-folder-icon"><Icon name={platformIcon(item.name) === 'folder' ? 'archive' : platformIcon(item.name)} size={34} /></span>
    <b>{item.name}</b><small>{num(item.count)} برنامه</small>
  </Link>)}</nav>
}

export function SectionTitle({ icon = 'grid', title, action }: { icon?: IconName; title: string; action?: { href: string; label: string } }) {
  return <header className="sp-sec-title"><h2><Icon name={icon} size={18} />{title}</h2>{action && <Link href={action.href}>{action.label} ←</Link>}</header>
}

// ------------------------------------------------------------------ cards

export type PrimaryTerm = { name: string; path: string; chain: { name: string; path: string }[] }

const licenceClass = (license: string) => (license === 'FREE' || license === 'OPEN_SOURCE' ? 'is-free' : license === 'PAID' || license === 'TRIAL' ? 'is-paid' : '')

/**
 * List card: icon, name + version, summary and the download button on one
 * side; the spec table (version, price, size, last update, platforms) and
 * the download count on the other.
 */
export function SoftwarePost({ item, fa, term }: { item: SoftwareCard; fa: boolean; term?: PrimaryTerm }) {
  const name = softwareName(item, fa)
  const href = `/software/${item.slug}`
  const specs: [string, ReactNode][] = [
    ['نسخه', item.version ? <bdi dir="ltr">{item.version}</bdi> : '—'],
    ['هزینهٔ دانلود', <span key="p" className={`sp-price ${licenceClass(item.license)}`}>{fa ? item.licenseName : licenseLabel(item.license, fa)}</span>],
    ['حجم فایل', item.size ? <bdi dir="ltr">{item.size}</bdi> : '—'],
    ['آخرین به‌روزرسانی', day(item.updatedAt, fa)],
    ['سیستم‌عامل', item.platforms.length ? <bdi dir="ltr">{item.platforms.join(', ')}</bdi> : '—'],
  ]
  return (
    <article className="sp-row">
      <div className="sp-row-main">
        <Link href={href} className="sp-row-icon" tabIndex={-1} aria-hidden="true">{item.icon ? <img src={item.icon} alt="" loading="lazy" width={64} height={64} /> : <span>{name.slice(0, 1)}</span>}</Link>
        <div className="sp-row-text">
          {term && <nav className="sp-post-cats" aria-label="دسته">{term.chain.map((node, index) => <span key={node.path}>{index > 0 && <Icon name="chevron" size={11} />}<Link href={node.path}>{node.name}</Link></span>)}</nav>}
          <h2><Link href={href}><bdi>{name}</bdi>{item.version && <> <bdi dir="ltr" className="sp-ver">{item.version}</bdi></>}</Link>{isFresh(item.updatedAt) && <em className="sp-new">به‌روز شد</em>}{item.access === 'MEMBERS' && <VipBadge fa={fa} small />}</h2>
          {item.summary && <p className="sp-summary">{item.summary}</p>}
        </div>
        <Link href={`${href}#download`} className="sp-row-cta"><Icon name="download" size={18} />دانلود کنید</Link>
      </div>
      <div className="sp-row-side">
        <p className="sp-row-count"><Icon name="download" size={15} /><b>{num(item.downloads, fa)}</b> دانلود</p>
        <dl className="sp-specs">{specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>
    </article>
  )
}

/** Icon card for shelves and related lists. */
export function SoftwareTile({ item }: { item: SoftwareCard }) {
  const name = softwareName(item, true)
  return <Link href={`/software/${item.slug}`} className="sp-app">
    <span className="sp-app-icon">{item.icon ? <img src={item.icon} alt="" loading="lazy" width={56} height={56} /> : <span>{name.slice(0, 1)}</span>}</span>
    <b><bdi>{name}</bdi></b>
    {item.recommendationReason && <small className="sp-app-reason">{item.recommendationReason}</small>}
    {item.version && <small dir="ltr">{item.version}</small>}
    {item.summary && <span className="sp-app-sum">{item.summary}</span>}
  </Link>
}

export function SoftwareShelf({ title, items, more, icon = 'apps' }: { title: string; items: SoftwareCard[]; more?: string; icon?: IconName }) {
  if (!items.length) return null
  return <section className="sp-shelf">
    <SectionTitle icon={icon} title={title} action={more ? { href: more, label: 'مشاهدهٔ همه' } : undefined} />
    <div className="sp-apps">{items.map((item) => <SoftwareTile key={item.id} item={item} />)}</div>
    {more && <Link href={more} className="sp-more-btn">مشاهدهٔ بیشتر</Link>}
  </section>
}

export type NewsItem = { slug: string; title: string; excerpt: string; cover: string; publishedAt: Date; category: { name: string } | null }

/** “Technology news” box: one lead story and a grid of small ones (from the journal). */
export function NewsBox({ items }: { items: NewsItem[] }) {
  if (!items.length) return null
  const [lead, ...rest] = items
  return <section className="sp-news">
    <SectionTitle icon="sparkle" title="تازه‌های دنیای فناوری" action={{ href: '/blog', label: 'مشاهدهٔ همه' }} />
    <Link href={`/blog/${lead.slug}`} className="sp-news-lead">
      <img src={sized(lead.cover, 480)} srcSet={srcSet(lead.cover, 480)} alt="" loading="lazy" />
      <span><small>{lead.category?.name || 'خبر فناوری'}</small><b>{lead.title}</b>{lead.excerpt && <em>{lead.excerpt}</em>}</span>
    </Link>
    {rest.length > 0 && <div className="sp-news-grid">{rest.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`} className="sp-news-item"><img src={sized(post.cover, 160)} alt="" loading="lazy" /><b>{post.title}</b></Link>)}</div>}
  </section>
}

// ------------------------------------------------------------------ sidebar

export type TermNode = { id: number; name: string; path: string; count: number; children: TermNode[] }

/** Category tree from the section taxonomy (collapsible roots with nested sub-categories). */
function TermTree({ nodes, active }: { nodes: TermNode[]; active?: number }) {
  const contains = (node: TermNode): boolean => node.id === active || node.children.some(contains)
  const branch = (list: TermNode[], depth: number): ReactNode => <ul className={depth ? 'sp-subtree' : 'sp-tree'}>{list.map((node) => {
    const link = <Link href={node.path} className={node.id === active ? 'is-active' : ''} aria-current={node.id === active ? 'page' : undefined}>{depth === 0 && <Icon name={platformIcon(node.name)} />}<span>{node.name}</span></Link>
    return <li key={node.id}>
      {node.children.length ? <details open={contains(node)}>
        <summary>{link}<small>{num(node.count)}</small><Icon name="chevron" size={12} /></summary>
        {branch(node.children, depth + 1)}
      </details> : <div className="sp-leaf">{link}<small>{num(node.count)}</small></div>}
    </li>
  })}</ul>
  return <>{branch(nodes, 0)}</>
}

export type Promo = { title: string; text: string; href: string; image: string; cta: string } | null

/** Sidebar: promo banner, editor suggestions, category tree and most downloaded. */
export function SoftwareSidebar({ data, fa, active, terms, activeTerm, suggestions = [], promo = null }: {
  data: { tree: SoftwareTree; viewed: SoftwareCard[]; downloaded: SoftwareCard[]; today: SoftwareCard[]; total: number }
  fa: boolean
  active?: { platform?: string; category?: string }
  terms?: TermNode[]
  activeTerm?: number
  suggestions?: SoftwareCard[]
  promo?: Promo
}) {
  return <>
    {promo ? <Link href={promo.href} className={`sp-banner${promo.image ? ' has-image' : ''}`} style={promo.image ? { backgroundImage: `url("${encodeURI(promo.image)}")` } : undefined}>
      <b>{promo.title}</b>{promo.text && <span>{promo.text}</span>}<em>{promo.cta || 'مشاهده'} ←</em>
    </Link> : <Link href="/vip" className="sp-banner"><b>دانلود بدون محدودیت</b><span>با اشتراک ویژه، لینک مستقیم و نسخه‌های کامل</span><em>عضویت VIP ←</em></Link>}
    {suggestions.length > 0 && <section className="sp-box">
      <h3><Icon name="star" size={15} />پیشنهاد موبوکام</h3>
      <ul className="sp-suggest">{suggestions.map((item) => <li key={item.id}><Link href={`/software/${item.slug}`}>
        <span className="sp-suggest-icon">{item.icon ? <img src={item.icon} alt="" loading="lazy" width={40} height={40} /> : softwareName(item, fa).slice(0, 1)}</span>
        <span><b><bdi>{softwareName(item, fa)}</bdi>{item.version && <> <bdi dir="ltr">{item.version}</bdi></>}</b>{item.summary && <small>{item.summary}</small>}</span>
      </Link></li>)}</ul>
    </section>}
    {terms && terms.length > 0 ? <nav className="sp-box" aria-label="دسته‌بندی نرم‌افزارها">
      <h3><Icon name="folder" size={15} />دسته‌بندی‌ها <small>{num(data.total)}</small></h3>
      <TermTree nodes={terms} active={activeTerm} />
    </nav> : data.tree.length > 0 && <nav className="sp-box" aria-label="دسته‌بندی نرم‌افزارها">
      <h3><Icon name="folder" size={15} />دسته‌بندی‌ها <small>{num(data.total)}</small></h3>
      <ul className="sp-tree">{data.tree.map((node) => (
        <li key={node.platform}>
          <details open={active?.platform === node.platform}>
            <summary><Link href={`/software/browse?platform=${encodeURIComponent(node.platform)}`} className={active?.platform === node.platform && !active?.category ? 'is-active' : ''}><Icon name={platformIcon(node.platform)} /><span dir="ltr">{node.platform}</span></Link><small>{num(node.count)}</small><Icon name="chevron" size={12} /></summary>
            <ul className="sp-subtree">{node.categories.map((category) => (
              <li key={category.name}><div className="sp-leaf"><Link href={`/software/browse?platform=${encodeURIComponent(node.platform)}&category=${encodeURIComponent(category.name)}`} className={active?.platform === node.platform && active?.category === category.name ? 'is-active' : ''}><span>{category.name}</span></Link><small>{num(category.count)}</small></div></li>
            ))}</ul>
          </details>
        </li>
      ))}</ul>
    </nav>}
    {data.downloaded.length > 0 && <section className="sp-box">
      <h3><Icon name="download" size={15} />پردانلودترین‌ها</h3>
      <ol className="sp-ranked">{data.downloaded.map((item, index) => <li key={item.id}>
        <b>{num(index + 1)}</b>
        <Link href={`/software/${item.slug}`}><span><bdi>{softwareName(item, fa)}</bdi></span>{item.version && <small dir="ltr">{item.version}</small>}</Link>
        <em>{num(item.downloads)}</em>
      </li>)}</ol>
    </section>}
  </>
}

export function Pager({ page, pages, href, fa }: { page: number; pages: number; href: (page: number) => string; fa: boolean }) {
  if (pages <= 1) return null
  const shown = Array.from({ length: pages }, (_, index) => index + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2)
  return (
    <nav className="md-pager sp-pager" aria-label={fa ? 'صفحه‌ها' : 'Pages'}>
      {page > 1 && <Link href={href(page - 1)} rel="prev" aria-label="صفحهٔ قبل">‹</Link>}
      {shown.map((n, index) => <span key={n} className="sp-pager-item">{index > 0 && n - shown[index - 1] > 1 && <i>…</i>}{n === page ? <b aria-current="page">{num(n, fa)}</b> : <Link href={href(n)}>{num(n, fa)}</Link>}</span>)}
      {page < pages && <Link href={href(page + 1)} rel="next" aria-label="صفحهٔ بعد">›</Link>}
    </nav>
  )
}
