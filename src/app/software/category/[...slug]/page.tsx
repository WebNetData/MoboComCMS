import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { softwareFeed } from '@/modules/media/server/queries'
import { softwarePortalChrome } from '@/modules/media/server/software-portal'
import { primaryTerms, resolveTermPath } from '@/modules/taxonomy/server/taxonomy'
import { SOFTWARE_LICENSES, licenseLabel } from '@/modules/media/domain/media'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import { FolderTiles, Pager, SoftwareLayout, SoftwarePost, SoftwareSidebar, SoftwareStatsStrip } from '@/components/software/SoftwarePortal'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<{ page?: string; sort?: string; license?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page, sort, license }] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('software', slug)
  if (!found) return { title: 'پیدا نشد', robots: { index: false } }
  const n = Number(page) || 1
  const title = found.term.seoTitle || `دانلود نرم‌افزارهای ${found.chain.map((node) => node.name).join(' ')}`
  return {
    title: n > 1 ? `${title} — صفحه ${n.toLocaleString('fa-IR')}` : title,
    description: found.term.seoDescription || found.term.description || `دانلود جدیدترین نسخهٔ نرم‌افزارهای دستهٔ ${found.term.name} با لینک مستقیم، راهنمای نصب و تغییرات هر نسخه`,
    alternates: { canonical: toPublicPath(n > 1 ? `${found.term.path}?page=${n}` : found.term.path) },
    robots: sort || license ? { index: false, follow: true } : undefined,
  }
}

/** Category archive (/software/category/windows/graphics): breadcrumb, sub-category folders, list cards with specs. */
export default async function SoftwareCategoryPage({ params, searchParams }: Props) {
  await requireModule('software')
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('software', slug)
  if (!found) notFound()
  const page = Math.max(1, Number(query.page) || 1)
  const [feed, chrome] = await Promise.all([softwareFeed({ ids: found.ownerIds, page, sort: query.sort, license: query.license }), softwarePortalChrome()])
  const terms = await primaryTerms('software', feed.items.map((item) => item.id))
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ sort: query.sort, license: query.license, ...patch }).filter((entry): entry is [string, string] => !!entry[1]))
    return `${found.term.path}${next.size ? `?${next}` : ''}`
  }
  const sorts: [string, string][] = [['', 'جدیدترین'], ['popular', 'پردانلود'], ['views', 'پربازدید'], ['name', 'الفبایی']]
  const pager = <Pager page={feed.page} pages={feed.pages} fa href={(n) => href({ page: n > 1 ? String(n) : undefined })} />
  return (
    <MediaShell section="software">
      <SoftwareStatsStrip stats={chrome.stats} />
      <SoftwareLayout sidebar={<SoftwareSidebar data={chrome.sidebar} fa terms={chrome.terms} activeTerm={found.term.id} suggestions={chrome.suggestions} promo={chrome.promo} />}>
        <FolderTiles items={found.children.length ? found.children : found.siblings} />
        <nav className="tc-crumbs sp-crumbs" aria-label="مسیر صفحه">
          <Link href="/software">نرم‌افزار</Link>
          {found.chain.slice(0, -1).map((node) => <span key={node.id}><span aria-hidden="true"> › </span><Link href={node.path}>{node.name}</Link></span>)}
          <span aria-hidden="true"> › </span><span aria-current="page">{found.term.name}</span>
        </nav>
        <header className="sp-list-head"><h1>{found.term.seoTitle || `دانلود نرم‌افزارهای ${found.term.name}`}</h1><span>{feed.total.toLocaleString('fa-IR')} نرم‌افزار</span></header>
        {found.term.description && <p className="sp-list-desc">{found.term.description}</p>}
        <div className="sp-filters">
          <nav className="md-chips" aria-label="مرتب‌سازی">{sorts.map(([value, label]) => <Link key={value} href={href({ sort: value || undefined, page: undefined })} className={(query.sort || '') === value ? 'is-active' : ''}>{label}</Link>)}</nav>
          <nav className="md-chips" aria-label="مجوز"><Link href={href({ license: undefined })} className={!query.license ? 'is-active' : ''}>همه مجوزها</Link>{SOFTWARE_LICENSES.map((l) => <Link key={l} href={href({ license: l })} className={query.license === l ? 'is-active' : ''}>{licenseLabel(l, true)}</Link>)}</nav>
        </div>
        {pager}
        {feed.items.length ? feed.items.map((item) => <SoftwarePost key={item.id} item={item} fa term={terms.get(item.id)} />) : <EmptyState fa title="هنوز نرم‌افزاری در این دسته نیست" text="دسته‌های دیگر یا جست‌وجو را امتحان کنید." />}
        {pager}
      </SoftwareLayout>
    </MediaShell>
  )
}
