import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { softwareReleaseFeed } from '@/modules/media/server/queries'
import { softwarePortalChrome } from '@/modules/media/server/software-portal'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import { Pager, SoftwareLayout, SoftwareSidebar, SoftwareStatsStrip } from '@/components/software/SoftwarePortal'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Params = Record<string, string | undefined>
type Props = { searchParams: Promise<Params> }
const channels = [['', 'همهٔ کانال‌ها'], ['STABLE', 'پایدار'], ['BETA', 'آزمایشی'], ['NIGHTLY', 'شبانه']]
const platforms = ['', 'Windows', 'macOS', 'Linux', 'Android', 'iOS']
const architectures = ['', 'x86', 'x64', 'arm64', 'armv7', 'universal']
const date = (value: Date) => value.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' })

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams
  return { title: 'نسخه‌ها و به‌روزرسانی‌های نرم‌افزار', robots: params.q || params.software ? { index: false } : undefined, alternates: { canonical: toPublicPath('/software/releases') } }
}

export default async function SoftwareReleasesPage({ searchParams }: Props) {
  await requireModule('software')
  const params = await searchParams
  const [feed, chrome] = await Promise.all([softwareReleaseFeed({ ...params, page: Number(params.page) || 1 }), softwarePortalChrome()])
  const query = (patch: Params) => {
    const next = new URLSearchParams(Object.entries({ ...params, ...patch }).filter((entry): entry is [string, string] => !!entry[1] && ['software', 'channel', 'platform', 'architecture', 'q', 'page'].includes(entry[0])))
    return `/software/releases${next.size ? `?${next}` : ''}`
  }
  const pager = <Pager page={feed.page} pages={feed.pages} fa href={(page) => query({ page: page > 1 ? String(page) : undefined })} />
  return <MediaShell section="software" search={{ action: '/software/releases', placeholder: 'جست‌وجوی نسخه یا نرم‌افزار…', value: params.q }}>
    <SoftwareStatsStrip stats={chrome.stats} />
    <SoftwareLayout sidebar={<SoftwareSidebar data={chrome.sidebar} fa terms={chrome.terms} suggestions={chrome.suggestions} promo={chrome.promo} />}>
      <nav className="tc-crumbs sp-crumbs" aria-label="مسیر صفحه"><Link href="/software">نرم‌افزار</Link><span aria-hidden="true"> › </span><span aria-current="page">نسخه‌ها</span></nav>
      <header className="sp-list-head"><h1>نسخه‌ها و به‌روزرسانی‌ها</h1><span>{feed.total.toLocaleString('fa-IR')} نسخه</span></header>
      <form className="sp-release-search" action="/software/releases" method="get" role="search">
        {params.software && <input type="hidden" name="software" value={params.software} />}
        <input className="input" name="q" defaultValue={params.q || ''} placeholder="نام نرم‌افزار یا شمارهٔ نسخه" aria-label="جست‌وجوی نسخه‌ها" />
        <button className="btn btn-primary" type="submit">جست‌وجو</button>
      </form>
      <div className="sp-release-filters">
        <nav className="md-chips" aria-label="کانال نسخه">{channels.map(([value, label]) => <Link key={value} href={query({ channel: value || undefined, page: undefined })} className={(params.channel || '') === value ? 'is-active' : ''}>{label}</Link>)}</nav>
        <nav className="md-chips" aria-label="سیستم‌عامل">{platforms.map((value) => <Link key={value} href={query({ platform: value || undefined, page: undefined })} className={(params.platform || '') === value ? 'is-active' : ''}>{value || 'همهٔ سیستم‌عامل‌ها'}</Link>)}</nav>
        <nav className="md-chips" aria-label="معماری پردازنده">{architectures.map((value) => <Link key={value} href={query({ architecture: value || undefined, page: undefined })} className={(params.architecture || '') === value ? 'is-active' : ''}>{value || 'همهٔ معماری‌ها'}</Link>)}</nav>
      </div>
      {params.software && <Link className="sp-release-clear" href={query({ software: undefined, page: undefined })}>نمایش نسخه‌های همهٔ نرم‌افزارها ←</Link>}
      {pager}
      {feed.items.length ? <ol className="sp-release-archive">{feed.items.map((release) => <li key={release.id}>
        <Link href={`/software/${release.software.slug}/releases/${release.id}`} className="sp-release-archive-card">
          <span className="sp-release-archive-icon">{release.software.icon ? <img src={release.software.icon} alt="" loading="lazy" /> : release.software.title.slice(0, 1)}</span>
          <span className="sp-release-archive-main"><b>{release.software.title} <bdi dir="ltr">{release.version}</bdi></b><small>{release.channel === 'BETA' ? 'آزمایشی' : release.channel === 'NIGHTLY' ? 'شبانه' : 'پایدار'} · {date(release.releasedAt)}{release.size ? ` · ${release.size}` : ''}</small>{release.changelog && <span>{release.changelog}</span>}{release.targets.length > 0 && <span className="sp-release-archive-targets">{release.targets.map((target) => <em key={`${target.platform}:${target.architecture}`} dir="ltr">{target.platform}{target.architecture ? ` · ${target.architecture}` : ''}</em>)}</span>}</span>
          <span className="sp-release-archive-go">جزئیات و دانلود ←</span>
        </Link>
      </li>)}</ol> : <EmptyState fa title="نسخه‌ای پیدا نشد" text="فیلترها یا عبارت جست‌وجو را تغییر دهید." />}
      {pager}
    </SoftwareLayout>
  </MediaShell>
}
