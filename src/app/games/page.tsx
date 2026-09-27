import type { Metadata } from 'next'
import { requireModule, isModuleEnabled } from '@/extensions/server/modules'
import { gamePosts, getGamesHome } from '@/modules/media/server/queries'
import { gameGenres } from '@/modules/media/server/games-portal'
import { getViewer } from '@/modules/membership/server/membership'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import VipStrip from '@/components/media/VipStrip'
import GameHero from '@/components/games/GameHero'
import { GameRail, GenreTiles, PlatformCards, PostsBlock, ReviewBand } from '@/components/games/GamePortal'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'بازی — نقد، بررسی و دانلود بازی',
  description: 'نقد و بررسی، نمره، سیستم مورد نیاز و دانلود بازی‌های کامپیوتر، کنسول و موبایل',
  alternates: { canonical: '/games' },
}

/**
 * Games home: GameUp catalogue (hero, platforms, genres, cover rails) with
 * Liona's editorial blocks (review band, latest posts) in between.
 */
export default async function GamesHomePage() {
  await requireModule('games')
  const landing = await sectionLanding('games')
  if (landing) return landing
  const [data, viewer, genres, journal] = await Promise.all([getGamesHome(), getViewer(), gameGenres(), isModuleEnabled('journal')])
  const posts = journal ? await gamePosts(9) : []
  const slides = data.hero.map((game) => ({ id: game.id, slug: game.slug, title: game.title, summary: game.summary, backdrop: game.backdrop, cover: game.cover, screenshots: game.screenshots, genres: game.genres, score: game.score }))
  return (
    <MediaShell section="games">
      <h1 className="sr-only">بازی</h1>
      <GameHero slides={slides} />
      <PlatformCards platforms={data.platforms} />
      <GenreTiles tiles={genres.tiles} />
      {!data.latest.length && <div className="container"><EmptyState fa title="بخش بازی آماده است" text="به‌زودی نقد و دانلود بازی‌ها اینجا منتشر می‌شود." /></div>}
      <GameRail title="جدیدترین بازی‌ها" games={data.latest} more="/games/browse" icon="sparkle" />
      <GameRail title="بازی‌های پیشنهادی" games={data.recommended} icon="star" />
      <ReviewBand lead={data.reviewed[0]} groups={[
        { key: 'new', label: 'تازه‌ترین نقدها', games: data.reviewed },
        { key: 'top', label: 'بیشترین نمره', games: data.topRated },
        { key: 'popular', label: 'محبوب‌ترین‌ها', games: data.popular },
      ]} />
      <GameRail title="محبوب‌ترین‌ها" games={data.popular} more="/games/browse?sort=views" icon="trophy" />
      <GameRail title="به‌زودی" games={data.upcoming} icon="clock" />
      <PostsBlock posts={posts} />
      {!viewer.member && <div className="container gx-vip"><VipStrip fa kind="games" /></div>}
    </MediaShell>
  )
}
