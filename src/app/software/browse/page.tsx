import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { softwareFeed } from '@/modules/media/server/queries'
import { softwarePortalChrome } from '@/modules/media/server/software-portal'
import { ownerIdsForTermSlug, primaryTerms } from '@/modules/taxonomy/server/taxonomy'
import { SOFTWARE_LICENSES, licenseLabel } from '@/modules/media/domain/media'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import { Pager, SoftwareLayout, SoftwarePost, SoftwareSidebar, SoftwareStatsStrip } from '@/components/software/SoftwarePortal'

export const dynamic = 'force-dynamic'
type Params = Record<string, string | undefined>
type Props = { searchParams: Promise<Params> }

function heading(params: Params) {
  if (params.q) return `نتایج جست‌وجوی «${params.q}»`
  const parts = [params.category, params.platform].filter(Boolean)
  if (parts.length) return `دانلود نرم‌افزار ${parts.join(' برای ')}`
  if (params.license) return `نرم‌افزارهای ${licenseLabel(params.license, true)}`
  return params.sort === 'popular' ? 'پردانلودترین نرم‌افزارها' : 'آخرین نرم‌افزارها و به‌روزرسانی‌ها'
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => !!entry[1] && ['platform', 'category', 'page'].includes(entry[0])))
  return { title: heading(params), robots: params.q || params.term ? { index: false } : undefined, alternates: { canonical: `/software/browse${query.size ? `?${query}` : ''}` } }
}

/** Full list with search, sort and licence filters (also the target of the section search). */
export default async function SoftwareBrowsePage({ searchParams }: Props) {
  await requireModule('software')
  const params = await searchParams
  const ids = params.term ? await ownerIdsForTermSlug('software', params.term) : null
  const [feed, chrome] = await Promise.all([
    softwareFeed({ platform: params.platform, category: params.category, license: params.license, sort: params.sort, q: params.q, page: Number(params.page) || 1, ...(ids ? { ids } : {}) }),
    softwarePortalChrome(),
  ])
  const terms = await primaryTerms('software', feed.items.map((item) => item.id))
  const query = (patch: Params) => {
    const next = new URLSearchParams(Object.entries({ ...params, ...patch }).filter((entry): entry is [string, string] => !!entry[1]))
    return `/software/browse${next.size ? `?${next}` : ''}`
  }
  const sorts = [['', 'جدیدترین'], ['popular', 'پردانلود'], ['views', 'پربازدید'], ['name', 'الفبایی']]
  const pager = <Pager page={feed.page} pages={feed.pages} fa href={(n) => query({ page: n > 1 ? String(n) : undefined })} />
  return (
    <MediaShell section="software" search={{ action: '/software/browse', placeholder: 'جست‌وجوی نرم‌افزار…', value: params.q }}>
      <SoftwareStatsStrip stats={chrome.stats} />
      <SoftwareLayout sidebar={<SoftwareSidebar data={chrome.sidebar} fa active={{ platform: params.platform, category: params.category }} terms={chrome.terms} suggestions={chrome.suggestions} promo={chrome.promo} />}>
        <nav className="tc-crumbs sp-crumbs" aria-label="مسیر صفحه"><Link href="/software">نرم‌افزار</Link><span aria-hidden="true"> › </span><span aria-current="page">{heading(params)}</span></nav>
        <header className="sp-list-head"><h1>{heading(params)}</h1><span>{feed.total.toLocaleString('fa-IR')} نرم‌افزار</span></header>
        <div className="sp-filters">
          <nav className="md-chips" aria-label="مرتب‌سازی">{sorts.map(([value, label]) => <Link key={value} href={query({ sort: value || undefined, page: undefined })} className={(params.sort || '') === value ? 'is-active' : ''}>{label}</Link>)}</nav>
          <nav className="md-chips" aria-label="مجوز"><Link href={query({ license: undefined, page: undefined })} className={!params.license ? 'is-active' : ''}>همه مجوزها</Link>{SOFTWARE_LICENSES.map((l) => <Link key={l} href={query({ license: l, page: undefined })} className={params.license === l ? 'is-active' : ''}>{licenseLabel(l, true)}</Link>)}</nav>
        </div>
        {pager}
        {feed.items.length ? feed.items.map((item) => <SoftwarePost key={item.id} item={item} fa term={terms.get(item.id)} />) : <EmptyState fa title="چیزی پیدا نشد" text="فیلترها یا عبارت جست‌وجو را تغییر دهید." />}
        {pager}
      </SoftwareLayout>
    </MediaShell>
  )
}
