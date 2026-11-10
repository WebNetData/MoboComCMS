import SectionName from '@/components/site/SectionName'
import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { topGames } from '@/modules/games/server/portal'
import { gameFacets } from '@/modules/media/server/queries'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import { RankedList } from '@/components/games/GameV2'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Search = { year?: string; platform?: string; by?: string }

const heading = (p: Search) => `${p.by === 'members' ? 'محبوب‌ترین بازی‌ها از نگاه کاربران' : 'بهترین بازی‌ها'}${p.year ? ` ${Number(p.year).toLocaleString('fa-IR', { useGrouping: false })}` : ''}${p.platform ? ` برای ${p.platform}` : ''}`

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const p = await searchParams
  return { title: heading(p), description: 'رتبه‌بندی بازی‌ها بر اساس نمرهٔ منتقدان موبوکام و امتیاز کاربران، به تفکیک سال و پلتفرم.', alternates: { canonical: toPublicPath('/games/top') } }
}

/** Ranked lists by year, platform and critics/members. */
export default async function TopGamesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('games')
  const params = await searchParams
  const [data, facets] = await Promise.all([topGames(params), gameFacets()])
  const href = (patch: Search) => {
    const q = new URLSearchParams(Object.entries({ ...params, ...patch }).filter(([, v]) => v) as [string, string][])
    return q.toString() ? `/games/top?${q}` : '/games/top'
  }
  return (
    <MediaShell section="games">
      <div className="container gv-page">
        <header className="gv-page-head">
          <nav className="gx-crumbs" aria-label="مسیر صفحه"><Link href="/games"><SectionName id="games">بازی</SectionName></Link> › برترین‌ها</nav>
          <h1>{heading(params)}</h1>
        </header>
        <div className="gv-filters">
          <nav className="gv-seg" aria-label="مبنای رتبه‌بندی">
            <Link href={href({ by: undefined })} className={data.by === 'critics' ? 'is-active' : ''} aria-current={data.by === 'critics' ? 'page' : undefined}>نمرهٔ منتقدان</Link>
            <Link href={href({ by: 'members' })} className={data.by === 'members' ? 'is-active' : ''} aria-current={data.by === 'members' ? 'page' : undefined}>امتیاز کاربران</Link>
          </nav>
          <nav className="gx-sorts" aria-label="سال">
            <Link href={href({ year: undefined })} className={!data.year ? 'is-active' : ''}>همهٔ سال‌ها</Link>
            {data.years.map((year) => <Link key={year} href={href({ year: String(year) })} className={data.year === year ? 'is-active' : ''}>{year.toLocaleString('fa-IR', { useGrouping: false })}</Link>)}
          </nav>
          <nav className="gx-sorts" aria-label="پلتفرم">
            <Link href={href({ platform: undefined })} className={!params.platform ? 'is-active' : ''}>همهٔ پلتفرم‌ها</Link>
            {facets.platforms.map((p) => <Link key={p} href={href({ platform: p })} className={params.platform === p ? 'is-active' : ''}>{p}</Link>)}
          </nav>
        </div>
        {data.list.length ? <RankedList rows={data.list} by={data.by as 'critics' | 'members'} /> : <EmptyState fa title="بازی‌ای در این فهرست نیست" text={data.by === 'members' ? 'هنوز کاربری به این بازی‌ها امتیاز نداده است.' : 'فیلتر سال یا پلتفرم را تغییر دهید.'} />}
      </div>
    </MediaShell>
  )
}
