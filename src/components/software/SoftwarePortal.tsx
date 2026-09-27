import Link from 'next/link'
import type { ReactNode } from 'react'
import { licenseLabel } from '@/modules/media/domain/media'
import type { SoftwareCard, SoftwareTree } from '@/modules/media/server/queries'
import { VipBadge } from '@/components/media/MediaCards'

// Download portal (Softgozar-style): a feed of release posts in the main
// column and a sidebar with the category tree, today's updates and rankings.

const num = (value: number, fa: boolean) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
const day = (value: Date, fa: boolean) => new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
export const isFresh = (value: Date) => Date.now() - new Date(value).getTime() < 3 * 86_400_000
export const softwareName = (item: Pick<SoftwareCard, 'title' | 'titleEn'>, fa: boolean) => (fa ? item.title : item.titleEn || item.title)

type IconName = 'calendar' | 'folder' | 'eye' | 'download' | 'disk' | 'search' | 'windows' | 'apple' | 'linux' | 'android' | 'phone' | 'grid' | 'chevron'
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
}
const FILLED = new Set<IconName>(['windows', 'apple'])

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name)
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sp-ico">{PATHS[name]}</svg>
}

/** Platform or category name → icon (by common names; falls back to a grid). */
export function platformIcon(name: string): IconName {
  const n = name.toLowerCase()
  if (/win|ویندوز/.test(n)) return 'windows'
  if (/mac|os x|مک/.test(n)) return 'apple'
  if (/linux|لینوکس/.test(n)) return 'linux'
  if (/android|اندروید/.test(n)) return 'android'
  if (/ios|iphone|ipad|آیفون|موبایل/.test(n)) return 'phone'
  return 'grid'
}

export function SoftwareLayout({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
  return <div className="container sp-layout"><div className="sp-main">{children}</div><aside className="sp-aside" aria-label="ستون کناری">{sidebar}</aside></div>
}

export type PrimaryTerm = { name: string; path: string; chain: { name: string; path: string }[] }

/** One release in the feed: icon, “Download X vY”, meta line, summary, platforms and the download call to action. */
export function SoftwarePost({ item, fa, term }: { item: SoftwareCard; fa: boolean; term?: PrimaryTerm }) {
  const name = softwareName(item, fa)
  const href = `/software/${item.slug}`
  return (
    <article className="sp-post">
      <Link href={href} className="sp-post-icon" tabIndex={-1} aria-hidden="true">{item.icon ? <img src={item.icon} alt="" loading="lazy" width={72} height={72} /> : <span>{name.slice(0, 1)}</span>}</Link>
      <div className="sp-post-body">
        {term && <nav className="sp-post-cats" aria-label="دسته">{term.chain.map((node, index) => <span key={node.path}>{index > 0 && <Icon name="chevron" size={11} />}<Link href={node.path}>{node.name}</Link></span>)}</nav>}
        <h2><Link href={href}>{fa ? 'دانلود ' : ''}<bdi>{name}</bdi>{item.version && <bdi className="sp-ver" dir="ltr">v{item.version.replace(/^v/i, '')}</bdi>}{!fa && ' download'}</Link>{isFresh(item.updatedAt) && <em className="sp-new">{fa ? 'به‌روز شد' : 'Updated'}</em>}</h2>
        {item.summary && <p className="sp-summary">{item.summary}</p>}
        <ul className="sp-meta">
          <li><Icon name="calendar" /><time dateTime={new Date(item.updatedAt).toISOString()}>{day(item.updatedAt, fa)}</time></li>
          {!term && item.category && <li><Icon name="folder" /><Link href={`/software/browse?category=${encodeURIComponent(item.category)}`}>{item.category}</Link></li>}
          <li><Icon name="eye" />{num(item.views, fa)} {fa ? 'بازدید' : 'views'}</li>
          <li><Icon name="download" />{num(item.downloads, fa)} {fa ? 'دانلود' : 'downloads'}</li>
          {item.size && <li><Icon name="disk" /><bdi dir="ltr">{item.size}</bdi></li>}
        </ul>
        <div className="sp-post-foot">
          <span className="sp-badges">
            <em className={`sp-license is-${item.license.toLowerCase()}`}>{licenseLabel(item.license, fa)}</em>
            {item.platforms.map((platform) => <em key={platform} className="sp-platform"><Icon name={platformIcon(platform)} size={13} /><bdi dir="ltr">{platform}</bdi></em>)}
            {item.access === 'MEMBERS' && <VipBadge fa={fa} small />}
          </span>
          <Link href={href} className="sp-more"><Icon name="download" />{fa ? 'دانلود و جزئیات' : 'Details & download'}</Link>
        </div>
      </div>
    </article>
  )
}

function Ranked({ title, items, fa, metric }: { title: string; items: SoftwareCard[]; fa: boolean; metric: 'views' | 'downloads' | 'date' }) {
  if (!items.length) return null
  return (
    <section className="sp-box">
      <h3>{title}</h3>
      <ol className="sp-ranked">{items.map((item, index) => (
        <li key={item.id}>
          <b>{num(index + 1, fa)}</b>
          <Link href={`/software/${item.slug}`}><span><bdi>{softwareName(item, fa)}</bdi></span>{item.version && <small dir="ltr">{item.version}</small>}</Link>
          <em>{metric === 'views' ? num(item.views, fa) : metric === 'downloads' ? num(item.downloads, fa) : new Date(item.updatedAt).toLocaleTimeString(fa ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</em>
        </li>
      ))}</ol>
    </section>
  )
}

export type TermNode = { id: number; name: string; path: string; count: number; children: TermNode[] }

/** Category tree from the section taxonomy (collapsible roots with nested sub-categories). */
function TermTree({ nodes, active, fa }: { nodes: TermNode[]; active?: number; fa: boolean }) {
  const contains = (node: TermNode): boolean => node.id === active || node.children.some(contains)
  const branch = (list: TermNode[], depth: number): ReactNode => <ul className={depth ? 'sp-subtree' : 'sp-tree'}>{list.map((node) => {
    const link = <Link href={node.path} className={node.id === active ? 'is-active' : ''} aria-current={node.id === active ? 'page' : undefined}>{depth === 0 && <Icon name={platformIcon(node.name)} />}<span>{node.name}</span></Link>
    return <li key={node.id}>
      {node.children.length ? <details open={contains(node) || (!active && depth === 0 && node === nodes[0])}>
        <summary>{link}<small>{num(node.count, fa)}</small><Icon name="chevron" size={12} /></summary>
        {branch(node.children, depth + 1)}
      </details> : <div className="sp-leaf">{link}<small>{num(node.count, fa)}</small></div>}
    </li>
  })}</ul>
  return <>{branch(nodes, 0)}</>
}

/** Sidebar: search, category tree (taxonomy when defined, else platform facets), today's updates and rankings. */
export function SoftwareSidebar({ data, fa, active, terms, activeTerm }: {
  data: { tree: SoftwareTree; viewed: SoftwareCard[]; downloaded: SoftwareCard[]; today: SoftwareCard[]; total: number }
  fa: boolean
  active?: { platform?: string; category?: string }
  terms?: TermNode[]
  activeTerm?: number
}) {
  return <>
    <form action="/software/browse" className="sp-box sp-search" role="search">
      <input name="q" type="search" placeholder={fa ? 'نام نرم‌افزار…' : 'Software name…'} aria-label={fa ? 'جست‌وجوی نرم‌افزار' : 'Search software'} />
      <button type="submit" aria-label={fa ? 'جست‌وجو' : 'Search'}><Icon name="search" size={18} /></button>
    </form>
    {terms && terms.length > 0 ? <nav className="sp-box" aria-label={fa ? 'دسته‌بندی نرم‌افزارها' : 'Software categories'}>
      <h3>{fa ? 'دسته‌بندی‌ها' : 'Categories'} <small>{num(data.total, fa)}</small></h3>
      <TermTree nodes={terms} active={activeTerm} fa={fa} />
    </nav> : data.tree.length > 0 && <nav className="sp-box" aria-label={fa ? 'دسته‌بندی نرم‌افزارها' : 'Software categories'}>
      <h3>{fa ? 'دسته‌بندی‌ها' : 'Categories'} <small>{num(data.total, fa)}</small></h3>
      <ul className="sp-tree">{data.tree.map((node) => (
        <li key={node.platform}>
          <details open={active?.platform === node.platform || (!active?.platform && node === data.tree[0])}>
            <summary><Link href={`/software/browse?platform=${encodeURIComponent(node.platform)}`} className={active?.platform === node.platform && !active?.category ? 'is-active' : ''}><Icon name={platformIcon(node.platform)} /><span dir="ltr">{node.platform}</span></Link><small>{num(node.count, fa)}</small><Icon name="chevron" size={12} /></summary>
            <ul className="sp-subtree">{node.categories.map((category) => (
              <li key={category.name}><div className="sp-leaf"><Link href={`/software/browse?platform=${encodeURIComponent(node.platform)}&category=${encodeURIComponent(category.name)}`} className={active?.platform === node.platform && active?.category === category.name ? 'is-active' : ''}><span>{category.name}</span></Link><small>{num(category.count, fa)}</small></div></li>
            ))}</ul>
          </details>
        </li>
      ))}</ul>
    </nav>}
    <Ranked title={fa ? 'به‌روزرسانی‌های امروز' : 'Updated today'} items={data.today} fa={fa} metric="date" />
    <Ranked title={fa ? 'پربازدیدترین‌ها' : 'Most viewed'} items={data.viewed} fa={fa} metric="views" />
    <Ranked title={fa ? 'پردانلودترین‌ها' : 'Most downloaded'} items={data.downloaded} fa={fa} metric="downloads" />
  </>
}

export function Pager({ page, pages, href, fa }: { page: number; pages: number; href: (page: number) => string; fa: boolean }) {
  if (pages <= 1) return null
  const shown = Array.from({ length: pages }, (_, index) => index + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2)
  return (
    <nav className="md-pager sp-pager" aria-label={fa ? 'صفحه‌ها' : 'Pages'}>
      {page > 1 && <Link href={href(page - 1)} rel="prev">{fa ? '→ قبلی' : '← Prev'}</Link>}
      {shown.map((n, index) => <span key={n} className="sp-pager-item">{index > 0 && n - shown[index - 1] > 1 && <i>…</i>}{n === page ? <b aria-current="page">{num(n, fa)}</b> : <Link href={href(n)}>{num(n, fa)}</Link>}</span>)}
      {page < pages && <Link href={href(page + 1)} rel="next">{fa ? 'بعدی ←' : 'Next →'}</Link>}
    </nav>
  )
}
