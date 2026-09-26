import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { getGamesHome } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { gamesNav } from '@/components/media/nav'
import { Chips, EmptyState, GameCard, ScoreBadge, Shelf, VipBadge } from '@/components/media/MediaCards'
import VipStrip from '@/components/media/VipStrip'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const fa = (await getServerLocale()) === 'fa'
  return { title: fa ? 'بازی — نقد، بررسی و دانلود بازی' : 'Games — reviews and downloads', description: fa ? 'نقد و بررسی، نمره، سیستم مورد نیاز و دانلود بازی‌های کامپیوتر، کنسول و موبایل' : 'Reviews, scores, requirements and downloads for PC, console and mobile games.', alternates: { canonical: '/games' } }
}

export default async function GamesHomePage() {
  await requireModule('games')
  const [data, locale, viewer] = await Promise.all([getGamesHome(), getServerLocale(), getViewer()])
  const fa = locale === 'fa'
  const [lead, ...side] = data.hero
  const date = (d: Date | null) => (d ? new Date(d).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '')

  return (
    <MediaShell section="games" active="home" nav={gamesNav(fa)} search={{ action: '/games/browse', placeholder: fa ? 'جست‌وجوی بازی…' : 'Search games…' }}>
      {lead ? (
        <section className="gm-hero">
          <div className="container gm-hero-grid">
            <Link href={`/games/${lead.slug}`} className="gm-hero-lead" style={lead.backdrop ? { backgroundImage: `url("${lead.backdrop.replace(/"/g, '%22')}")` } : undefined}>
              <span className="gm-hero-shade" aria-hidden="true" />
              <span className="gm-hero-copy">
                <span className="gm-platforms">{lead.platforms.slice(0, 5).map((p) => <em key={p}>{p}</em>)}</span>
                <b>{fa ? lead.title : lead.titleEn || lead.title}</b>
                {lead.summary && <small>{lead.summary.slice(0, 180)}</small>}
                <span className="gm-hero-tags"><ScoreBadge score={lead.score} fa={fa} />{lead.access === 'MEMBERS' && <VipBadge fa={fa} small />}{lead.genres.slice(0, 2).map((g) => <em key={g}>{g}</em>)}</span>
              </span>
            </Link>
            <div className="gm-hero-side">
              {side.slice(0, 3).map((game) => (
                <Link key={game.id} href={`/games/${game.slug}`} className="gm-hero-mini" style={game.backdrop ? { backgroundImage: `url("${game.backdrop.replace(/"/g, '%22')}")` } : undefined}>
                  <span className="gm-hero-shade" aria-hidden="true" />
                  <span className="gm-hero-copy"><b>{fa ? game.title : game.titleEn || game.title}</b><span className="gm-hero-tags"><ScoreBadge score={game.score} fa={fa} />{game.platforms.slice(0, 2).map((p) => <em key={p}>{p}</em>)}</span></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="container md-body">
        {data.platforms.length > 0 && <Chips items={data.platforms} hrefFor={(p) => `/games/browse?platform=${encodeURIComponent(p)}`} all={{ label: fa ? 'همه پلتفرم‌ها' : 'All platforms', href: '/games/browse' }} />}
        {!data.latest.length && <EmptyState fa={fa} title={fa ? 'بخش بازی آماده است' : 'Games are ready'} text={fa ? 'به‌زودی نقد و دانلود بازی‌ها اینجا منتشر می‌شود.' : 'Reviews and downloads are coming soon.'} />}
        {data.latest.length > 0 && <Shelf tone="games" eyebrow={fa ? 'تازه‌ها' : 'Latest'} title={fa ? 'جدیدترین بازی‌ها' : 'New games'} href="/games/browse" more={fa ? 'همه ←' : 'All →'}>{data.latest.map((game) => <GameCard key={game.id} game={game} fa={fa} />)}</Shelf>}
        {data.topRated.length > 0 && (
          <section className="md-shelf is-games">
            <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'نمره منتقدان' : 'Critics'}</span><h2>{fa ? 'برترین بازی‌ها' : 'Top rated'}</h2></div><Link href="/games/browse?sort=score" className="md-more">{fa ? 'رده‌بندی کامل ←' : 'Full ranking →'}</Link></header>
            <ol className="gm-ranking">
              {data.topRated.map((game, i) => (
                <li key={game.id}>
                  <Link href={`/games/${game.slug}`}>
                    <span className="gm-rank">{(i + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>
                    {game.cover ? <img src={game.cover} alt="" loading="lazy" /> : <span className="gm-noart">🎮</span>}
                    <span className="gm-rank-meta"><b>{fa ? game.title : game.titleEn || game.title}</b><small>{[game.developer, ...game.genres.slice(0, 2)].filter(Boolean).join(' · ')}</small></span>
                    <ScoreBadge score={game.score} fa={fa} />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}
        {data.upcoming.length > 0 && (
          <Shelf tone="games" eyebrow={fa ? 'به‌زودی' : 'Coming soon'} title={fa ? 'بازی‌های در راه' : 'Upcoming releases'}>
            {data.upcoming.map((game) => <div key={game.id} className="gm-upcoming"><GameCard game={game} fa={fa} /><time>{date(game.releaseDate)}</time></div>)}
          </Shelf>
        )}
        {data.genres.length > 0 && (
          <section className="md-shelf is-games">
            <header className="md-shelf-head"><h2>{fa ? 'سبک‌ها' : 'Genres'}</h2></header>
            <div className="gm-genres">{data.genres.map((g, i) => <Link key={g} href={`/games/browse?genre=${encodeURIComponent(g)}`} className={`tone-${i % 6}`}>{g}</Link>)}</div>
          </section>
        )}
        {!viewer.member && <VipStrip fa={fa} kind="games" />}
      </div>
    </MediaShell>
  )
}
