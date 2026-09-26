import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { browseSoftware } from '@/modules/media/server/queries'
import { SOFTWARE_LICENSES, SOFTWARE_PLATFORMS, licenseLabel } from '@/modules/media/domain/media'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { softwareNav } from '@/components/media/nav'
import { EmptyState, SoftwareCard } from '@/components/media/MediaCards'

export const dynamic = 'force-dynamic'
type Props = { searchParams: Promise<Record<string, string | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const fa = (await getServerLocale()) === 'fa'
  return { title: fa ? 'فهرست نرم‌افزارها' : 'Browse software', alternates: { canonical: '/software/browse' } }
}

export default async function SoftwareBrowsePage({ searchParams }: Props) {
  await requireModule('software')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const data = await browseSoftware({ platform: params.platform, category: params.category, license: params.license, sort: params.sort, q: params.q, page: Number(params.page) || 1 })
  const query = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ ...params, ...patch }).filter((entry): entry is [string, string] => !!entry[1]))
    return `/software/browse${next.size ? `?${next}` : ''}`
  }
  const active = params.sort === 'popular' ? 'popular' : params.platform === 'Windows' ? 'windows' : params.platform === 'macOS' ? 'mac' : params.platform === 'Android' ? 'android' : params.platform === 'iOS' ? 'ios' : 'latest'
  return (
    <MediaShell section="software" active={active} nav={softwareNav(fa)} search={{ action: '/software/browse', placeholder: fa ? 'جست‌وجوی نرم‌افزار…' : 'Search software…', value: params.q }}>
      <div className="container md-body">
        <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'نرم‌افزار' : 'Software'}</span><h1 className="sw-title">{params.q ? (fa ? `نتایج «${params.q}»` : `Results for “${params.q}”`) : params.category || params.platform || (fa ? 'همه نرم‌افزارها' : 'All software')}</h1></div><span className="md-muted">{data.total.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'مورد' : 'items'}</span></header>
        <div className="sw-filters">
          <nav className="md-chips" aria-label={fa ? 'پلتفرم' : 'Platform'}><Link href={query({ platform: undefined, page: undefined })} className={!params.platform ? 'is-active' : ''}>{fa ? 'همه پلتفرم‌ها' : 'All platforms'}</Link>{SOFTWARE_PLATFORMS.map((p) => <Link key={p} href={query({ platform: p, page: undefined })} className={params.platform === p ? 'is-active' : ''}>{p}</Link>)}</nav>
          <nav className="md-chips" aria-label={fa ? 'مجوز' : 'License'}><Link href={query({ license: undefined, page: undefined })} className={!params.license ? 'is-active' : ''}>{fa ? 'همه مجوزها' : 'Any license'}</Link>{SOFTWARE_LICENSES.map((l) => <Link key={l} href={query({ license: l, page: undefined })} className={params.license === l ? 'is-active' : ''}>{licenseLabel(l, fa)}</Link>)}</nav>
        </div>
        {data.items.length ? <div className="sw-grid">{data.items.map((item) => <SoftwareCard key={item.id} item={item} fa={fa} />)}</div> : <EmptyState fa={fa} title={fa ? 'چیزی پیدا نشد' : 'Nothing found'} text={fa ? 'فیلترها یا عبارت جست‌وجو را تغییر دهید.' : 'Try other filters or search terms.'} />}
        {data.pages > 1 && <nav className="md-pager" aria-label={fa ? 'صفحه‌ها' : 'Pages'}>{Array.from({ length: Math.min(data.pages, 20) }, (_, i) => i + 1).map((n) => n === data.page ? <b key={n}>{n.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b> : <Link key={n} href={query({ page: String(n) })}>{n.toLocaleString(fa ? 'fa-IR' : 'en-US')}</Link>)}</nav>}
      </div>
    </MediaShell>
  )
}
