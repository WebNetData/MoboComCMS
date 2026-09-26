import Link from 'next/link'
import type { ReactNode } from 'react'
import { licenseLabel } from '@/modules/media/domain/media'
import type { SoftwareCard, SoftwareTree } from '@/modules/media/server/queries'
import { VipBadge } from '@/components/media/MediaCards'

// Download-portal layout (Softgozar style): a feed of release posts on the
// main column and a sidebar with the platform/category tree and rankings.

const PLATFORM_ICON: Record<string, string> = { Windows: '⊞', macOS: '⌘', Linux: '🐧', Android: '🤖', iOS: '📱' }
const num = (value: number, fa: boolean) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
const day = (value: Date, fa: boolean) => new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
export const isFresh = (value: Date) => Date.now() - new Date(value).getTime() < 3 * 86_400_000
export const softwareName = (item: Pick<SoftwareCard, 'title' | 'titleEn'>, fa: boolean) => (fa ? item.title : item.titleEn || item.title)

export function SoftwareLayout({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
  return <div className="container sp-layout"><div className="sp-main">{children}</div><aside className="sp-aside">{sidebar}</aside></div>
}

/** One release in the feed: icon, "Download X vY", meta line, summary and badges. */
export function SoftwarePost({ item, fa }: { item: SoftwareCard; fa: boolean }) {
  const name = softwareName(item, fa)
  return (
    <article className="sp-post">
      <Link href={`/software/${item.slug}`} className="sp-post-icon" tabIndex={-1} aria-hidden="true">{item.icon ? <img src={item.icon} alt="" loading="lazy" /> : <span>{name.slice(0, 1)}</span>}</Link>
      <div className="sp-post-body">
        <h2><Link href={`/software/${item.slug}`}>{fa ? 'دانلود ' : ''}<bdi>{name}</bdi>{item.version && <bdi className="sp-ver" dir="ltr">{item.version}</bdi>}{!fa && ' download'}</Link>{isFresh(item.updatedAt) && <em className="sp-new">{fa ? 'به‌روز شد' : 'Updated'}</em>}</h2>
        <p className="sp-meta">
          <span>🗓 {day(item.updatedAt, fa)}</span>
          {item.category && <Link href={`/software/browse?category=${encodeURIComponent(item.category)}`}>📁 {item.category}</Link>}
          <span>👁 {num(item.views, fa)}</span>
          <span>⤓ {num(item.downloads, fa)}</span>
          {item.size && <span dir="ltr">💾 {item.size}</span>}
        </p>
        {item.summary && <p className="sp-summary">{item.summary}</p>}
        <div className="sp-post-foot">
          <span className="sw-tags"><em>{licenseLabel(item.license, fa)}</em>{item.platforms.map((platform) => <em key={platform} dir="ltr">{platform}</em>)}{item.access === 'MEMBERS' && <VipBadge fa={fa} small />}</span>
          <Link href={`/software/${item.slug}`} className="sp-more">{fa ? 'ادامه و دانلود ←' : 'Details & download →'}</Link>
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

/** Sidebar: search, platform → category tree (with counts), today's updates and rankings. */
export function SoftwareSidebar({ data, fa, active }: { data: { tree: SoftwareTree; viewed: SoftwareCard[]; downloaded: SoftwareCard[]; today: SoftwareCard[]; total: number }; fa: boolean; active?: { platform?: string; category?: string } }) {
  return <>
    <form action="/software/browse" className="sp-box sp-search" role="search">
      <input name="q" type="search" placeholder={fa ? 'نام نرم‌افزار…' : 'Software name…'} aria-label={fa ? 'جست‌وجوی نرم‌افزار' : 'Search software'} />
      <button type="submit">{fa ? 'جست‌وجو' : 'Search'}</button>
    </form>
    {data.tree.length > 0 && <nav className="sp-box" aria-label={fa ? 'دسته‌بندی نرم‌افزارها' : 'Software categories'}>
      <h3>{fa ? 'دسته‌بندی‌ها' : 'Categories'} <small>{num(data.total, fa)}</small></h3>
      <ul className="sp-tree">{data.tree.map((node) => (
        <li key={node.platform}>
          <details open={active?.platform === node.platform || (!active?.platform && node === data.tree[0])}>
            <summary><Link href={`/software/browse?platform=${encodeURIComponent(node.platform)}`} className={active?.platform === node.platform && !active?.category ? 'is-active' : ''}><span aria-hidden="true">{PLATFORM_ICON[node.platform] || '▪'}</span><span dir="ltr">{node.platform}</span></Link><small>{num(node.count, fa)}</small></summary>
            <ul>{node.categories.map((category) => (
              <li key={category.name}><Link href={`/software/browse?platform=${encodeURIComponent(node.platform)}&category=${encodeURIComponent(category.name)}`} className={active?.platform === node.platform && active?.category === category.name ? 'is-active' : ''}>{category.name}</Link><small>{num(category.count, fa)}</small></li>
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
