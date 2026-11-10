import SectionName from '@/components/site/SectionName'
import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { releaseCalendar, upcomingReleases } from '@/modules/games/server/portal'
import { gameFacets } from '@/modules/media/server/queries'
import MediaShell from '@/components/media/MediaShell'
import { CalendarGrid } from '@/components/games/GameV2'
import { GameRail } from '@/components/games/GamePortal'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Search = { month?: string; platform?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const p = await searchParams
  const { month } = await releaseCalendar(p.month, p.platform)
  return { title: `تقویم انتشار بازی‌ها — ${month.label}${p.platform ? ` (${p.platform})` : ''}`, description: `بازی‌هایی که در ${month.label} برای کامپیوتر، کنسول و موبایل منتشر می‌شوند.`, alternates: { canonical: toPublicPath('/games/calendar') }, robots: p.platform ? { index: false } : undefined }
}

/** Persian-month release calendar with a platform filter. */
export default async function GamesCalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('games')
  const params = await searchParams
  const [data, facets, upcoming] = await Promise.all([releaseCalendar(params.month, params.platform), gameFacets(), upcomingReleases(12)])
  const href = (patch: Search) => {
    const q = new URLSearchParams(Object.entries({ ...params, ...patch }).filter(([, v]) => v) as [string, string][])
    return q.toString() ? `/games/calendar?${q}` : '/games/calendar'
  }
  return (
    <MediaShell section="games">
      <div className="container gv-page">
        <header className="gv-page-head">
          <nav className="gx-crumbs" aria-label="مسیر صفحه"><Link href="/games"><SectionName id="games">بازی</SectionName></Link> › تقویم انتشار</nav>
          <h1>تقویم انتشار بازی‌ها</h1>
          <p>تاریخ عرضهٔ بازی‌ها روی هر پلتفرم، ماه به ماه. روی هر بازی بزنید تا تریلر، اطلاعات و لینک‌ها را ببینید.</p>
        </header>
        <nav className="gx-sorts" aria-label="پلتفرم">
          <Link href={href({ platform: undefined })} className={!params.platform ? 'is-active' : ''}>همهٔ پلتفرم‌ها</Link>
          {facets.platforms.map((p) => <Link key={p} href={href({ platform: p })} className={params.platform === p ? 'is-active' : ''}>{p}</Link>)}
        </nav>
        <CalendarGrid data={data} href={(month) => href({ month })} />
        {data.tba.length > 0 && <section className="gv-section"><h2 className="gv-h2">تاریخ انتشار اعلام نشده</h2><div className="gx-grid">{data.tba.map((game) => <Link key={game.id} href={`/games/${game.slug}`} className="gx-cover"><span className="gx-cover-art">{game.cover && <img src={game.cover} alt="" loading="lazy" />}</span><b>{game.title}</b></Link>)}</div></section>}
      </div>
      <GameRail title="نزدیک‌ترین انتشارها" games={upcoming} icon="clock" />
    </MediaShell>
  )
}
