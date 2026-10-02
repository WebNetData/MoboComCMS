import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import { scoreBand } from '@/modules/media/domain/media'
import Slider from '@/components/site/Slider'
import { sized, srcSet } from '@/shared/media/image'

/** Presentational building blocks shared by the music, cinema and games sections. */

type Fa = { fa: boolean }
export const yr = (value: number, fa: boolean) => value.toLocaleString(fa ? 'fa-IR' : 'en-US', { useGrouping: false })
const n = (value: number, fa: boolean, digits = 0) => value.toLocaleString(fa ? 'fa-IR' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export function VipBadge({ fa, small }: Fa & { small?: boolean }) {
  return <span className={`vip-chip${small ? ' is-small' : ''}`} title={fa ? 'مخصوص اعضای ویژه' : 'VIP members only'}>♛ VIP</span>
}

export function Shelf({ title, eyebrow, href, more, children, tone, id }: { title: string; eyebrow?: string; href?: string; more?: string; children: ReactNode; tone?: 'cinema' | 'music' | 'games' | 'software'; id?: string }) {
  return (
    <section className={`md-shelf${tone ? ` is-${tone}` : ''}`} id={id}>
      <header className="md-shelf-head">
        <div>{eyebrow && <span className="md-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        {href && <Link href={href} className="md-more">{more || '→'}</Link>}
      </header>
      <Slider className="md-rail">{children}</Slider>
    </section>
  )
}

export function Chips({ items, hrefFor, active, all }: { items: string[]; hrefFor: (item: string) => string; active?: string; all?: { label: string; href: string } }) {
  if (!items.length) return null
  return (
    <nav className="md-chips" aria-label="filters">
      {all && <Link href={all.href} className={!active ? 'is-active' : ''}>{all.label}</Link>}
      {items.map((item) => <Link key={item} href={hrefFor(item)} className={active === item ? 'is-active' : ''}>{item}</Link>)}
    </nav>
  )
}

export function EmptyState({ fa, title, text }: Fa & { title?: string; text?: string }) {
  return (
    <div className="md-empty">
      <span aria-hidden="true">✦</span>
      <b>{title || (fa ? 'به‌زودی…' : 'Coming soon…')}</b>
      <p>{text || (fa ? 'هنوز محتوایی در این بخش منتشر نشده است.' : 'Nothing has been published here yet.')}</p>
    </div>
  )
}

// ------------------------------------------------------------------ cinema

type TitleLike = { slug: string; kind: string; title: string; titleEn: string; poster: string; year: number | null; imdbRating: number | null; genres: string[]; quality: string; dubbed: boolean; subtitle: boolean; access: string; seasonsCount: number; recommendationReason?: string }

export function PosterCard({ item, fa, rank }: Fa & { item: TitleLike; rank?: number }) {
  const name = fa ? item.title : item.titleEn || item.title
  return (
    <Link href={`/cinema/${item.slug}`} className="cn-poster">
      {rank !== undefined && <span className="cn-rank" aria-hidden="true">{rank}</span>}
      <span className="cn-poster-art">
        {item.poster ? <img src={sized(item.poster, 320)} srcSet={srcSet(item.poster, 320)} alt={name} loading="lazy" /> : <span className="cn-noart">🎬</span>}
        <span className="cn-poster-badges">
          {item.access === 'MEMBERS' && <VipBadge fa={fa} small />}
          {item.dubbed && <span className="cn-badge is-dub">{fa ? 'دوبله' : 'Dub'}</span>}
          {!item.dubbed && item.subtitle && <span className="cn-badge is-sub">{fa ? 'زیرنویس' : 'Sub'}</span>}
        </span>
        {item.imdbRating != null && <span className="cn-imdb-mini"><b>IMDb</b>{n(item.imdbRating, fa, 1)}</span>}
        <span className="cn-poster-hover"><span className="cn-play" aria-hidden="true">▶</span>{item.quality && <em dir="ltr">{item.quality}</em>}</span>
      </span>
      <span className="cn-poster-title">{name}</span>
      <span className="cn-poster-meta">
        {item.kind === 'SERIES' ? (fa ? 'سریال' : 'Series') : (fa ? 'فیلم' : 'Movie')}
        {item.year ? ` · ${yr(item.year, fa)}` : ''}
        {item.kind === 'SERIES' && item.seasonsCount ? ` · ${n(item.seasonsCount, fa)} ${fa ? 'فصل' : item.seasonsCount > 1 ? 'seasons' : 'season'}` : ''}
      </span>
      {item.recommendationReason && <small className="cn-poster-reason">{fa ? item.recommendationReason : item.recommendationReason.startsWith('سبک مشترک: ') ? `Shared genre: ${item.recommendationReason.slice('سبک مشترک: '.length)}` : 'Same format'}</small>}
    </Link>
  )
}

export function ImdbBadge({ rating, fa, large }: Fa & { rating: number | null; large?: boolean }) {
  if (rating == null) return null
  return <span className={`cn-imdb${large ? ' is-large' : ''}`}><b>IMDb</b><span>{n(rating, fa, 1)}</span><small>/10</small></span>
}

// ------------------------------------------------------------------ music

type ArtistLike = { slug: string; name: string; nameEn: string; image: string }
type AlbumLike = { slug: string; title: string; titleEn: string; cover: string; year: number | null; access: string; artist: ArtistLike; trackCount: number }

export function AlbumCard({ album, fa }: Fa & { album: AlbumLike }) {
  const name = fa ? album.title : album.titleEn || album.title
  return (
    <Link href={`/music/album/${album.slug}`} className="mu-album">
      <span className="mu-album-art">
        {album.cover ? <img src={sized(album.cover, 320)} srcSet={srcSet(album.cover, 320)} alt={name} loading="lazy" /> : <span className="mu-noart">♪</span>}
        {album.access === 'MEMBERS' && <VipBadge fa={fa} small />}
        <span className="mu-album-play" aria-hidden="true">▶</span>
      </span>
      <b>{name}</b>
      <small>{fa ? album.artist.name : album.artist.nameEn || album.artist.name}{album.year ? ` · ${yr(album.year, fa)}` : ''}</small>
    </Link>
  )
}

export function ArtistBubble({ artist, fa }: Fa & { artist: ArtistLike }) {
  const name = fa ? artist.name : artist.nameEn || artist.name
  return (
    <Link href={`/music/artist/${artist.slug}`} className="mu-artist">
      <span>{artist.image ? <img src={artist.image} alt={name} loading="lazy" /> : <i>{name.slice(0, 1)}</i>}</span>
      <b>{name}</b>
    </Link>
  )
}

type PlaylistLike = { slug: string; title: string; titleEn: string; cover: string; description: string; access: string; trackCount: number }

export function PlaylistCard({ playlist, fa, index = 0 }: Fa & { playlist: PlaylistLike; index?: number }) {
  const name = fa ? playlist.title : playlist.titleEn || playlist.title
  return (
    <Link href={`/music/playlist/${playlist.slug}`} className={`mu-playlist tone-${index % 6}`}>
      {playlist.cover ? <img src={playlist.cover} alt="" loading="lazy" /> : null}
      <span className="mu-playlist-body">
        <small>{fa ? 'پلی‌لیست' : 'Playlist'} · {n(playlist.trackCount, fa)} {fa ? 'آهنگ' : 'tracks'}</small>
        <b>{name}</b>
        {playlist.access === 'MEMBERS' && <VipBadge fa={fa} small />}
      </span>
    </Link>
  )
}

// ------------------------------------------------------------------ games

type GameLike = { slug: string; title: string; titleEn: string; cover: string; platforms: string[]; genres: string[]; score: number | null; access: string; releaseDate: Date | null }

export function ScoreBadge({ score, fa, size = 'sm' }: Fa & { score: number | null; size?: 'sm' | 'lg' }) {
  if (score == null) return null
  const band = scoreBand(score)
  if (size === 'lg') {
    return (
      <span className={`gm-ring band-${band}`} style={{ ['--pct' as string]: `${score}%` }} role="img" aria-label={`${score}/100`}>
        <span><b>{n(score, fa)}</b><small>{fa ? 'نمره منتقدان' : 'Critics'}</small></span>
      </span>
    )
  }
  return <span className={`gm-score band-${band}`}>{n(score, fa)}</span>
}

export function GameCard({ game, fa }: Fa & { game: GameLike }) {
  const name = fa ? game.title : game.titleEn || game.title
  return (
    <Link href={`/games/${game.slug}`} className="gm-card">
      <span className="gm-card-art">
        {game.cover ? <img src={game.cover} alt={name} loading="lazy" /> : <span className="gm-noart">🎮</span>}
        <ScoreBadge score={game.score} fa={fa} />
        {game.access === 'MEMBERS' && <VipBadge fa={fa} small />}
      </span>
      <b>{name}</b>
      <span className="gm-platforms">{game.platforms.slice(0, 4).map((p) => <em key={p}>{p}</em>)}</span>
    </Link>
  )
}

// ------------------------------------------------------------------ VIP

/** Call to action shown in place of members-only content. */
export function VipGate({ fa, loggedIn, title, text, next }: Fa & { loggedIn: boolean; title?: string; text?: string; next?: string }) {
  return (
    <div className="vip-gate">
      <span className="vip-gate-crown" aria-hidden="true">♛</span>
      <div>
        <b>{title || (fa ? 'این محتوا مخصوص اعضای ویژه است' : 'This is for VIP members')}</b>
        <p>{text || (fa ? 'با عضویت VIP به همه محتوای ویژه، کیفیت بالاتر، دانلود مستقیم و قیمت‌های مخصوص اعضا دسترسی داشته باشید.' : 'Go VIP for every members-only title, higher quality, direct downloads and member prices.')}</p>
      </div>
      <div className="vip-gate-actions">
        <Link href="/vip" className="btn vip-btn">{fa ? 'عضویت ویژه' : 'Become VIP'}</Link>
        {!loggedIn && <Link href={`/login?next=${encodeURIComponent(next || '/vip')}`} className="btn btn-ghost">{fa ? 'قبلاً عضو شده‌ام — ورود' : 'Already VIP? Sign in'}</Link>}
      </div>
    </div>
  )
}

type SoftwareLike = { slug: string; title: string; titleEn: string; icon: string; version: string; developer: string; license: string; platforms: string[]; category: string; access: string }
const LICENSE: Record<string, [string, string]> = { FREE: ['رایگان', 'Free'], FREEMIUM: ['فریمیوم', 'Freemium'], TRIAL: ['آزمایشی', 'Trial'], PAID: ['پولی', 'Paid'], OPEN_SOURCE: ['متن‌باز', 'Open source'] }

export function SoftwareCard({ item, fa }: Fa & { item: SoftwareLike }) {
  const name = fa ? item.title : item.titleEn || item.title
  return (
    <Link href={`/software/${item.slug}`} className="sw-card">
      <span className="sw-icon">{item.icon ? <img src={item.icon} alt="" loading="lazy" /> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</span>
      <span className="sw-card-body">
        <b>{name}</b>
        <small dir="ltr">{[item.version && `v${item.version}`, item.developer].filter(Boolean).join(' · ')}</small>
        <span className="sw-tags"><em>{(LICENSE[item.license] || LICENSE.FREE)[fa ? 0 : 1]}</em>{item.platforms.slice(0, 3).map((p) => <em key={p}>{p}</em>)}{item.access === 'MEMBERS' && <VipBadge fa={fa} small />}</span>
      </span>
    </Link>
  )
}
