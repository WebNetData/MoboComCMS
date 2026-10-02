import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import type { ReactNode } from 'react'
import { requireModule } from '@/extensions/server/modules'
import { gameGenres } from '@/modules/media/server/games-portal'
import { gamesHome } from '@/modules/games/server/portal'
import { getViewer } from '@/modules/membership/server/membership'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import VipStrip from '@/components/media/VipStrip'
import GameHero from '@/components/games/GameHero'
import { GameRail, GenreTiles, PlatformCards, PostsBlock, ReviewBand } from '@/components/games/GamePortal'
import { FranchiseTiles, UpcomingList, WantedRail } from '@/components/games/GameV2'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'
import type { HomeRail } from '@/modules/games/domain/games'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return withSectionSeo('games', {
  title: 'بازی — نقد، بررسی، تقویم انتشار و دانلود بازی',
  description: 'نقد و بررسی، نمره، تقویم انتشار، سیستم مورد نیاز و دانلود بازی‌های کامپیوتر، کنسول و موبایل',
  alternates: { canonical: toPublicPath('/games') },
})
}

/**
 * Games home: GameUp catalogue (hero, platforms, genres, cover rails, release
 * calendar, most wanted) with Liona's editorial blocks, in the order and
 * selection the admin set under «مدیریت بازی › صفحهٔ اصلی».
 */
export default async function GamesHomePage() {
  await requireModule('games')
  const landing = await sectionLanding('games')
  if (landing) return landing
  const [home, viewer, genres] = await Promise.all([gamesHome(), getViewer(), gameGenres()])
  const data = home.base
  const slides = data.hero.map((game) => ({ id: game.id, slug: game.slug, title: game.title, summary: game.summary, backdrop: game.backdrop, cover: game.cover, screenshots: game.screenshots, genres: game.genres, score: game.score }))
  const blocks: Record<HomeRail, ReactNode> = {
    platforms: <PlatformCards platforms={data.platforms} counts={data.platformCounts} />,
    genres: <GenreTiles tiles={genres.tiles} />,
    latest: <GameRail title="جدیدترین بازی‌ها" games={data.latest} more="/games/browse" icon="sparkle" />,
    editors: <GameRail title="انتخاب سردبیر" games={home.editors} more="/games/browse?pick=editors" icon="trophy" />,
    calendar: <UpcomingList games={home.upcoming} />,
    reviews: <ReviewBand lead={data.reviewed[0]} groups={[
      { key: 'new', label: 'تازه‌ترین نقدها', games: data.reviewed },
      { key: 'top', label: 'بیشترین نمره', games: data.topRated },
      { key: 'popular', label: 'محبوب‌ترین‌ها', games: data.popular },
    ]} />,
    popular: <GameRail title="محبوب‌ترین‌ها" games={data.popular} more="/games/top" icon="star" />,
    wanted: <WantedRail rows={home.wanted} />,
    franchises: <FranchiseTiles items={home.franchises} />,
    news: <PostsBlock posts={home.news} />,
  }
  return (
    <MediaShell section="games">
      <h1 className="sr-only">بازی</h1>
      <GameHero slides={slides} />
      <nav className="container" aria-label="سازندگان و ناشران بازی"><Link className="btn btn-ghost" href="/studios">سازندگان و ناشران بازی و نرم‌افزار ←</Link></nav>
      {!data.latest.length && <div className="container"><EmptyState fa title="بخش بازی آماده است" text="به‌زودی نقد و دانلود بازی‌ها اینجا منتشر می‌شود." /></div>}
      {home.settings.rails.filter((rail) => rail.enabled).map((rail) => <div key={rail.key} className="gv-rail-slot">{blocks[rail.key]}</div>)}
      {!viewer.member && <div className="container gx-vip"><VipStrip fa kind="games" /></div>}
    </MediaShell>
  )
}
