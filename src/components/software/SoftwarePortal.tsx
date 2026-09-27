import Link from 'next/link'
import type { ReactNode } from 'react'
import { licenseLabel } from '@/modules/media/domain/media'
import type { SoftwareCard, SoftwareTree } from '@/modules/media/server/queries'
import { VipBadge } from '@/components/media/MediaCards'

// Download portal in the Softgozar layout: a stats strip, coloured category
// tiles, list cards with a spec table, icon shelves and a suggestions sidebar.

const num = (value: number, fa = true) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
const day = (value: Date | null, fa = true) => (value ? new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—')
export const isFresh = (value: Date) => Date.now() - new Date(value).getTime() < 3 * 86_400_000
export const softwareName = (item: Pick<SoftwareCard, 'title' | 'titleEn'>, fa: boolean) => (fa ? item.title : item.titleEn || item.title)

type IconName =
  | 'calendar' | 'folder' | 'eye' | 'download' | 'disk' | 'search' | 'windows' | 'apple' | 'linux' | 'android' | 'phone' | 'grid' | 'chevron'
  | 'apps' | 'refresh' | 'chat' | 'code' | 'palette' | 'film' | 'cube' | 'ruler' | 'shield' | 'globe' | 'music' | 'briefcase' | 'archive' | 'star' | 'info' | 'key' | 'tag' | 'sparkle' | 'wrench'
const PATHS: Record<IconName, ReactNode> = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  disk: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v6h10V3M8 21v-6h8v6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  windows: <path d="M3 5.5 10.5 4.5v7H3zM12 4.3 21 3v8.5h-9zM3 12.5h7.5v7L3 18.5zM12 12.5h9V21l-9-1.3z" />,
  apple: <path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8C6.9 7.4 5.4 8.3 4.6 9.8c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.7-1-2.7-4.2zM14.3 5.8c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" />,
  linux: <><path d="M12 3c-2 0-3 1.8-3 4 0 1.5-.5 2.5-1.5 4S5 14.5 5 16.5 7 20 9 20h6c2 0 4-1.5 4-3.5s-1.5-4-2.5-5.5S15 8.5 15 7c0-2.2-1-4-3-4z" /><circle cx="10.5" cy="8" r=".6" /><circle cx="13.5" cy="8" r=".6" /></>,
  android: <><path d="M5 10h14v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM5 9a7 7 0 0 1 14 0z" /><path d="m7.5 3.5 1.5 2.5M16.5 3.5 15 6" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  apps: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M9 21V9" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  code: <><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="8" r="1" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  cube: <><path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  ruler: <><path d="m3 17 14-14 4 4L7 21z" /><path d="m7 9 2 2M10 6l2 2M13 12l2 2M6 15l2 2" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  wrench: <path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.5-1.5a4 4 0 0 0-5-5z" />,
}
const FILLED = new Set<IconName>(['windows', 'apple'])

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name)
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sp-ico">{PATHS[name]}</svg>
}

/** Platform or category name → icon (by common words; falls back to a folder). */
export function platformIcon(name: string): IconName {
  const n = name.toLowerCase()
  if (/win|ویندوز/.test(n)) return 'windows'
  if (/mac|os x|مک/.test(n)) return 'apple'
  if (/linux|لینوکس/.test(n)) return 'linux'
  if (/android|اندروید/.test(n)) return 'android'
  if (/ios|iphone|ipad|آیفون|موبایل/.test(n)) return 'phone'
  if (/برنامه‌?نویس|توسعه|code|dev|شبکه/.test(n)) return 'code'
  if (/گرافیک|طراحی|عکس|تصویر|photo|design/.test(n)) return 'palette'
  if (/ویدیو|ویدئو|تدوین|فیلم|video|چندرسانه/.test(n)) return 'film'
  if (/سه‌?بعدی|3d|cgi/.test(n)) return 'cube'
  if (/مهندس|نقشه|cad/.test(n)) return 'ruler'
  if (/امنیت|آنتی|ویروس|security/.test(n)) return 'shield'
  if (/اینترنت|مرورگر|پیام|browser/.test(n)) return 'globe'
  if (/صوت|صوتی|موزیک|audio|music/.test(n)) return 'music'
  if (/اداری|office/.test(n)) return 'briefcase'
  if (/فشرده|zip|archive/.test(n)) return 'archive'
  if (/ابزار|سیستم|utility|tool/.test(n)) return 'wrench'
  return 'folder'
}

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
    ['هزینهٔ دانلود', <span key="p" className={`sp-price ${licenceClass(item.license)}`}>{licenseLabel(item.license, fa)}</span>],
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
      <img src={lead.cover} alt="" loading="lazy" />
      <span><small>{lead.category?.name || 'خبر فناوری'}</small><b>{lead.title}</b>{lead.excerpt && <em>{lead.excerpt}</em>}</span>
    </Link>
    {rest.length > 0 && <div className="sp-news-grid">{rest.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`} className="sp-news-item"><img src={post.cover} alt="" loading="lazy" /><b>{post.title}</b></Link>)}</div>}
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
