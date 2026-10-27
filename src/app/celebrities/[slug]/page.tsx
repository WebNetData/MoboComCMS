import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import MediaShell from '@/components/media/MediaShell'
import ManageBar from '@/components/admin/ManageBar'
import { PosterCard, AlbumCard, Shelf } from '@/components/media/MediaCards'
import { PlayButton, TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import { isModuleEnabled } from '@/extensions/server/modules'
import { listLabels } from '@/modules/vocabulary/server/vocabulary'
import { browseCinema, getArtist } from '@/modules/media/server/queries'
import { cinemaBrowseHref } from '@/modules/cinema/domain/discovery'
import { celebrityBySlug, ensureCelebritiesSynced } from '@/modules/celebrities/server/celebrities'
import { withTextDirections } from '@/modules/editor/domain/rich-text'
import { plainText } from '@/shared/text/plain'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
const fa = (value: number) => value.toLocaleString('fa-IR')

async function load(slug: string) {
  const [cinema, music] = await Promise.all([isModuleEnabled('cinema'), isModuleEnabled('music')])
  if (!cinema && !music) return null
  const labels = music ? await listLabels('music').catch(() => ({} as Record<string, Record<string, string>>)) : {}
  const person = await celebrityBySlug(decodeURIComponent(slug), labels.CREDIT_ROLE ?? {})
  return person ? { person, cinema, music } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug)
  if (!data) return {}
  const { card } = data.person
  const roles = card.roles.join('، ')
  return {
    title: `${card.name}${roles ? ` — ${roles}` : ''}`,
    description: plainText(data.person.musicBio || data.person.cinemaBio).slice(0, 160) || `${card.name}${roles ? `، ${roles}` : ''}: فیلم‌ها، سریال‌ها، آلبوم‌ها و آهنگ‌ها در موبوکام.`,
    alternates: { canonical: toPublicPath(`/celebrities/${encodeURIComponent(card.slug)}`) },
    openGraph: card.image ? { images: [card.image] } : undefined,
  }
}

export default async function CelebrityPage({ params }: Props) {
  await ensureCelebritiesSynced()
  const data = await load((await params).slug)
  if (!data) notFound()
  const { person, cinema, music } = data
  const { card } = person
  const personId = person.cinemaPersonId ? String(person.cinemaPersonId) : ''
  // Each section answers for its own works, with its own rule for what a visitor may see.
  const [acted, directed, produced, songs] = await Promise.all([
    cinema && personId ? browseCinema({ actor: personId }) : null,
    cinema && personId ? browseCinema({ director: personId }) : null,
    cinema && personId ? browseCinema({ producer: personId }) : null,
    music && person.musicSlug ? getArtist(person.musicSlug) : null,
  ])
  const tracks = songs ? toPlayerTracks(songs.tracks, true) : []
  const bio = songs?.artist.bio || ''
  const shelves = [
    { key: 'acted', title: 'بازیگری', result: acted, href: cinemaBrowseHref({ actor: personId }) },
    { key: 'directed', title: 'کارگردانی', result: directed, href: cinemaBrowseHref({ director: personId }) },
    { key: 'produced', title: 'تهیه‌کنندگی', result: produced, href: cinemaBrowseHref({ producer: personId }) },
  ].filter((shelf) => shelf.result && shelf.result.titles.length)
  const stats = [card.titles ? [card.titles, 'فیلم و سریال'] : null, card.albums ? [card.albums, 'آلبوم'] : null, card.songs ? [card.songs, 'آهنگ'] : null].filter((item): item is [number, string] => !!item)
  return <MediaShell section="celebrities" search={{ action: '/celebrities', placeholder: 'جست‌وجوی بازیگر، کارگردان یا خواننده…' }}>
    <ManageBar title="مدیریت چهره" anyOf={['cinema.manage', 'music.manage']} links={[{ href: `/admin/celebrities?q=${encodeURIComponent(card.name)}`, label: 'چهره‌ها در مدیریت' }]} />
    <section className="cb-profile">
      <div className="container cb-profile-inner">
        <span className="cb-avatar">{card.image ? <img src={card.image} alt={card.name} /> : <i aria-hidden="true">{card.name.slice(0, 1)}</i>}</span>
        <div className="cb-profile-copy">
          <nav className="cb-crumbs" aria-label="مسیر صفحه"><Link href="/celebrities">چهره‌ها</Link><span aria-hidden="true">/</span><span aria-current="page">{card.name}</span></nav>
          <h1>{card.name}</h1>
          {card.nameEn && <p className="cb-name-en" dir="ltr">{card.nameEn}</p>}
          {card.roles.length > 0 && <ul className="cb-role-chips" aria-label="نقش‌ها">{card.roles.map((role) => <li key={role}>{role}</li>)}</ul>}
          {stats.length > 0 && <ul className="cb-stats">{stats.map(([value, label]) => <li key={label}><b>{fa(value)}</b><small>{label}</small></li>)}</ul>}
          <div className="cb-actions">
            {tracks.length > 0 && <PlayButton tracks={tracks} index={0} variant="big" label="پخش آهنگ‌ها" />}
            {personId && cinema && <Link href={`/cinema/people/${personId}`} className="cb-section-link">صفحه در فیلم و سریال</Link>}
            {person.musicSlug && music && <Link href={`/music/artist/${encodeURIComponent(person.musicSlug)}`} className="cb-section-link">صفحه در موسیقی</Link>}
          </div>
        </div>
      </div>
    </section>
    <div className="container md-body cb-body">
      {shelves.map((shelf) => <section key={shelf.key} className="cb-shelf" aria-labelledby={`cb-${shelf.key}`}>
        <header className="md-shelf-head"><h2 id={`cb-${shelf.key}`}>{shelf.title} <small>{fa(shelf.result!.total)} اثر</small></h2>{shelf.result!.total > shelf.result!.titles.length && <Link href={shelf.href} className="md-more">همه</Link>}</header>
        <div className="cb-posters">{shelf.result!.titles.map((item) => <PosterCard key={item.id} item={item} fa />)}</div>
      </section>)}
      {tracks.length > 0 && <section className="mu-panel cb-shelf"><header className="md-shelf-head"><h2>آهنگ‌ها</h2></header><TrackList tracks={tracks} /></section>}
      {songs && songs.albums.length > 0 && <Shelf tone="music" title="آلبوم‌ها">{songs.albums.map((album) => <AlbumCard key={album.id} album={album} fa />)}</Shelf>}
      {songs?.credited.map((group) => <section key={group.role} className="mu-panel cb-shelf"><header className="md-shelf-head"><h2>{`${group.name} در آهنگ‌های دیگران`}</h2></header><TrackList tracks={toPlayerTracks(group.tracks, true)} /></section>)}
      {(bio || person.cinemaBio) && <section className="mu-panel md-prose cb-bio"><h2>بیوگرافی</h2>{bio ? <div dangerouslySetInnerHTML={{ __html: withTextDirections(bio) }} /> : <p>{plainText(person.cinemaBio)}</p>}</section>}
    </div>
  </MediaShell>
}
