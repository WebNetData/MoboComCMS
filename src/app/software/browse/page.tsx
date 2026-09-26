import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { softwareFeed, softwareSidebar } from '@/modules/media/server/queries'
import { SOFTWARE_LICENSES, licenseLabel } from '@/modules/media/domain/media'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { softwareNav } from '@/components/media/nav'
import { EmptyState } from '@/components/media/MediaCards'
import { Pager, SoftwareLayout, SoftwarePost, SoftwareSidebar } from '@/components/software/SoftwarePortal'

export const dynamic = 'force-dynamic'
type Props = { searchParams: Promise<Record<string, string | undefined>> }

function heading(params: Record<string, string | undefined>, fa: boolean) {
  if (params.q) return fa ? `نتایج جست‌وجوی «${params.q}»` : `Results for “${params.q}”`
  const parts = [params.category, params.platform].filter(Boolean)
  if (parts.length) return fa ? `دانلود نرم‌افزار ${parts.join(' برای ')}` : `${parts.join(' for ')} software`
  return params.sort === 'popular' ? (fa ? 'پردانلودترین نرم‌افزارها' : 'Most downloaded') : (fa ? 'همهٔ نرم‌افزارها' : 'All software')
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, fa] = [await searchParams, (await getServerLocale()) === 'fa']
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => !!entry[1] && ['platform', 'category', 'page'].includes(entry[0])))
  return { title: heading(params, fa), robots: params.q ? { index: false } : undefined, alternates: { canonical: `/software/browse${query.size ? `?${query}` : ''}` } }
}

export default async function SoftwareBrowsePage({ searchParams }: Props) {
  await requireModule('software')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const [feed, sidebar] = await Promise.all([
    softwareFeed({ platform: params.platform, category: params.category, license: params.license, sort: params.sort, q: params.q, page: Number(params.page) || 1 }),
    softwareSidebar(),
  ])
  const query = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ ...params, ...patch }).filter((entry): entry is [string, string] => !!entry[1]))
    return `/software/browse${next.size ? `?${next}` : ''}`
  }
  const active = params.sort === 'popular' ? 'popular' : params.platform === 'Windows' ? 'windows' : params.platform === 'macOS' ? 'mac' : params.platform === 'Android' ? 'android' : params.platform === 'iOS' ? 'ios' : 'latest'
  const sorts = [['', fa ? 'جدیدترین' : 'Newest'], ['popular', fa ? 'پردانلود' : 'Downloads'], ['views', fa ? 'پربازدید' : 'Views'], ['name', fa ? 'الفبایی' : 'A–Z']]
  return (
    <MediaShell section="software" active={active} nav={softwareNav(fa)} search={{ action: '/software/browse', placeholder: fa ? 'جست‌وجوی نرم‌افزار…' : 'Search software…', value: params.q }}>
      <SoftwareLayout sidebar={<SoftwareSidebar data={sidebar} fa={fa} active={{ platform: params.platform, category: params.category }} />}>
        <nav className="cn-crumbs sp-crumbs"><Link href="/software">{fa ? 'نرم‌افزار' : 'Software'}</Link>{params.platform && <> / <Link href={query({ category: undefined, page: undefined })} dir="ltr">{params.platform}</Link></>}{params.category && <> / <span>{params.category}</span></>}</nav>
        <header className="sp-feed-head"><h1>{heading(params, fa)}</h1><span className="md-muted">{feed.total.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'نرم‌افزار' : 'items'}</span></header>
        <div className="sp-filters">
          <nav className="md-chips" aria-label={fa ? 'مرتب‌سازی' : 'Sort'}>{sorts.map(([value, label]) => <Link key={value} href={query({ sort: value || undefined, page: undefined })} className={(params.sort || '') === value ? 'is-active' : ''}>{label}</Link>)}</nav>
          <nav className="md-chips" aria-label={fa ? 'مجوز' : 'License'}><Link href={query({ license: undefined, page: undefined })} className={!params.license ? 'is-active' : ''}>{fa ? 'همه مجوزها' : 'Any license'}</Link>{SOFTWARE_LICENSES.map((l) => <Link key={l} href={query({ license: l, page: undefined })} className={params.license === l ? 'is-active' : ''}>{licenseLabel(l, fa)}</Link>)}</nav>
        </div>
        {feed.items.length ? feed.items.map((item) => <SoftwarePost key={item.id} item={item} fa={fa} />) : <EmptyState fa={fa} title={fa ? 'چیزی پیدا نشد' : 'Nothing found'} text={fa ? 'فیلترها یا عبارت جست‌وجو را تغییر دهید.' : 'Try other filters or search terms.'} />}
        <Pager page={feed.page} pages={feed.pages} fa={fa} href={(n) => query({ page: n > 1 ? String(n) : undefined })} />
      </SoftwareLayout>
    </MediaShell>
  )
}
