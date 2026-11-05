import PdfDownload from '@/components/content/PdfDownload'
import { contentRouteParams } from '@/shared/routing/params'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from '@/components/AppLink'
import MediaShell from '@/components/media/MediaShell'
import ManageBar from '@/components/admin/ManageBar'
import { PosterCard, AlbumCard, Shelf } from '@/components/media/MediaCards'
import { PlayButton, TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import { isModuleEnabled } from '@/extensions/server/modules'
import { activeLists, listLabels } from '@/modules/vocabulary/server/vocabulary'
import { shownFacts } from '@/modules/celebrities/domain/fields'
import { browseCinema, getArtist } from '@/modules/media/server/queries'
import { cinemaBrowseHref } from '@/modules/cinema/domain/discovery'
import { celebrityBySlug, celebrityCollaborators, ensureCelebritiesSynced } from '@/modules/celebrities/server/celebrities'
import CelebrityCardView from '@/components/celebrities/CelebrityCard'
import { headers } from 'next/headers'
import { withTextDirections } from '@/modules/editor/domain/rich-text'
import { plainText } from '@/shared/text/plain'
import { toPublicPath } from '@/platform/routing/aliases'
import { ItemActionBar } from '@/components/engage/Engagement'
import { getCinemaSettings } from '@/modules/cinema/server/admin'
import { getMusicSettings } from '@/modules/music/server/admin'
import { shareCard } from '@/modules/site/server/seo'
import { getViewer } from '@/modules/membership/server/membership'
import { sectionClosedFor } from '@/modules/account/server/maintenance-access'
import { userOpensSection } from '@/modules/account/server/section-access'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
const fa = (value: number) => value.toLocaleString('fa-IR')

async function load(slug: string) {
  const [cinema, music] = await Promise.all([isModuleEnabled('cinema'), isModuleEnabled('music')])
  if (!cinema && !music) return null
  const labels = music ? await listLabels('music').catch(() => ({} as Record<string, Record<string, string>>)) : {}
  const person = await celebrityBySlug(slug, labels.CREDIT_ROLE ?? {})
  return person ? { person, cinema, music } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await contentRouteParams(params)).slug)
  if (!data) return {}
  const { card } = data.person
  const roles = card.roles.join('، ')
  return shareCard({
    title: `${card.name}${roles ? ` — ${roles}` : ''}`,
    description: plainText(data.person.musicBio || data.person.cinemaBio).slice(0, 160) || `${card.name}${roles ? `، ${roles}` : ''}: فیلم‌ها، سریال‌ها، آلبوم‌ها و آهنگ‌ها در موبوکام.`,
    alternates: { canonical: toPublicPath(`/celebrities/${encodeURIComponent(card.slug)}`) },
    openGraph: card.image ? { images: [card.image] } : undefined,
  })
}

export default async function CelebrityPage({ params }: Props) {
  await ensureCelebritiesSynced()
  const data = await load((await contentRouteParams(params)).slug)
  if (!data) notFound()
  const { person } = data
  const { userId } = await getViewer()
  // A closed section stays closed here too: its works and its player are not on this page.
  const [cinemaShut, musicShut, cinemaOpen, musicOpen] = await Promise.all([sectionClosedFor('cinema', userId), sectionClosedFor('music', userId), userOpensSection('cinema', userId), userOpensSection('music', userId)])
  const cinema = data.cinema && !cinemaShut && cinemaOpen, music = data.music && !musicShut && musicOpen
  const { card } = person
  if ((await contentRouteParams(params)).slug !== card.slug) permanentRedirect(toPublicPath(`/celebrities/${encodeURIComponent(card.slug)}`))
  const personId = person.cinemaPersonId ? String(person.cinemaPersonId) : ''
  // Each section answers for its own works, with its own rule for what a visitor may see.
  const [acted, directed, produced, songs, cinemaSettings, musicSettings] = await Promise.all([
    cinema && personId ? browseCinema({ actor: personId }) : null,
    cinema && personId ? browseCinema({ director: personId }) : null,
    cinema && personId ? browseCinema({ producer: personId }) : null,
    music && person.musicSlug ? getArtist(person.musicSlug) : null,
    cinema && personId ? getCinemaSettings(true) : null,
    music && person.musicSlug ? getMusicSettings(true) : null,
  ])
  const tracks = songs ? toPlayerTracks(songs.tracks, true) : []
  const bio = songs?.artist.bio || ''
  const labels = music ? await listLabels('music').catch(() => ({} as Record<string, Record<string, string>>)) : {}
  // The owner's profile fields: short ones under the name, long texts beside the biography (owner, 2026-10-28).
  const fields = (await activeLists('celebrities').catch(() => ({} as Record<string, never[]>))).PROFILE_FIELD || []
  const facts = shownFacts(person.facts, fields, new Date().toISOString().slice(0, 10))
  const factLine = facts.filter((fact) => fact.family !== 'LONG')
  const factTexts = facts.filter((fact) => fact.family === 'LONG')
  const team = await celebrityCollaborators({ cinemaPersonId: person.cinemaPersonId, musicArtistId: songs?.artist.id ?? null }, labels.CREDIT_ROLE ?? {})
  const shelves = [
    { key: 'directed', title: 'کارگردانی', result: directed, href: cinemaBrowseHref({ director: personId }) },
    { key: 'acted', title: 'بازیگری', result: acted, href: cinemaBrowseHref({ actor: personId }) },
    { key: 'produced', title: 'تهیه‌کنندگی', result: produced, href: cinemaBrowseHref({ producer: personId }) },
  ].filter((shelf) => shelf.result && shelf.result.titles.length)
  // «Known for»: their first works as director and actor, then their albums; at most six, none twice.
  const knownTitles = [...(directed?.titles || []).slice(0, 2), ...(acted?.titles || []).slice(0, 3), ...(produced?.titles || []).slice(0, 1)].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).slice(0, 4)
  const knownAlbums = (songs?.albums || []).slice(0, 6 - knownTitles.length)
  const stats = [cinema && card.titles ? [card.titles, 'فیلم و سریال'] : null, music && card.albums ? [card.albums, 'آلبوم'] : null, music && card.songs ? [card.songs, 'آهنگ'] : null, team.length ? [team.length, 'همکار'] : null].filter((item): item is [number, string] => !!item)
  const credited = songs?.credited || []
  const anchors = [
    shelves.length ? ['cb-films', 'فیلم و سریال'] : null,
    tracks.length ? ['cb-songs', 'آهنگ‌ها'] : null,
    songs?.albums.length ? ['cb-albums', 'آلبوم‌ها'] : null,
    credited.length ? ['cb-credits', 'همکاری در آهنگ‌ها'] : null,
    team.length ? ['cb-team', 'همکاران'] : null,
    bio || person.cinemaBio ? ['cb-bio', 'بیوگرافی'] : null,
    factTexts.length ? ['cb-facts-more', 'مشخصات'] : null,
  ].filter((item): item is [string, string] => !!item)
  const backdrop = card.cover || card.image
  const nav = [{ key: 'all', href: '/celebrities', label: 'همهٔ چهره‌ها' }, ...(cinema ? [{ key: 'cinema', href: '/celebrities?section=cinema', label: 'سینما و سریال' }] : []), ...(music ? [{ key: 'music', href: '/celebrities?section=music', label: 'موسیقی' }] : [])]
  // Structured data from the fields of those kinds: born, died, nationality.
  const factOf = (family: string) => { const field = fields.find((entry) => entry.family === family && person.facts[entry.code]); return field ? person.facts[field.code] : '' }
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Person', name: card.name, ...(factOf('BIRTH') ? { birthDate: factOf('BIRTH') } : {}), ...(factOf('DEATH') ? { deathDate: factOf('DEATH') } : {}), ...(factOf('COUNTRY') ? { nationality: { '@type': 'Country', name: factOf('COUNTRY') } } : {}), ...(card.nameEn ? { alternateName: card.nameEn } : {}), ...(card.image ? { image: card.image } : {}), ...(card.roles.length ? { jobTitle: card.roles.join('، ') } : {}) }
  return <MediaShell section="celebrities" nav={nav} search={{ action: '/celebrities', placeholder: 'جست‌وجوی بازیگر، کارگردان، خواننده…' }}>
    <script type="application/ld+json" nonce={(await headers()).get('x-nonce') || undefined} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    <ManageBar title="مدیریت هنرمند" anyOf={['cinema.manage', 'music.manage']} links={[{ href: `/admin/celebrities?edit=${card.id}`, label: 'ویرایش پروفایل' }, { href: `/admin/celebrities?q=${encodeURIComponent(card.name)}`, label: 'هنرمندان و چهره‌ها' }]} />
    <section className={`cb-profile${backdrop ? ' has-backdrop' : ''}`}>
      {backdrop && <span className="cb-profile-back" aria-hidden="true"><img src={backdrop} alt="" /></span>}
      <div className="container cb-profile-inner">
        <span className="cb-avatar">{card.image ? <img src={card.image} alt={card.name} /> : <i aria-hidden="true">{card.name.slice(0, 1)}</i>}</span>
        <div className="cb-profile-copy">
          <nav className="cb-crumbs" aria-label="مسیر صفحه"><Link href="/celebrities">چهره‌ها</Link><span aria-hidden="true">/</span><span aria-current="page">{card.name}</span></nav>
          <h1>{card.name}</h1>
          {card.nameEn && <p className="cb-name-en" dir="ltr">{card.nameEn}</p>}
          {factLine.length > 0 && <dl className="cb-facts">{factLine.map((fact) => <div key={fact.code} className={`cb-fact is-${fact.family.toLowerCase()}`}><dt>{fact.icon ? <span aria-hidden="true">{fact.icon} </span> : null}{fact.label}</dt><dd>{fact.href ? <a href={fact.href} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">{fact.text}</a> : fact.text}{fact.note && <small>{fact.note}</small>}</dd></div>)}</dl>}
          {card.roles.length > 0 && <ul className="cb-role-chips" aria-label="نقش‌ها">{card.roles.map((role) => <li key={role}>{role}</li>)}</ul>}
          {stats.length > 0 && <ul className="cb-stats">{stats.map(([value, label]) => <li key={label}><b>{fa(value)}</b><small>{label}</small></li>)}</ul>}
          <div className="cb-actions">
            {tracks.length > 0 && <PlayButton tracks={tracks} index={0} variant="big" label="پخش آهنگ‌ها" />}
          </div>
          {/* Following stays per section: new songs from the music side, new films and series from the cinema side. */}
          <div className="cb-follow">
            {(songs || personId) && <PdfDownload item={songs ? `artist:${songs.artist.id}` : `person:${personId}`}/>}
            {songs && musicSettings?.showArtistFollow && <ItemActionBar pdf={false} item={{ type: 'artist', id: songs.artist.id }} title={card.name} image={card.image} followLabel="آهنگ‌های تازه" />}
            {personId && cinemaSettings?.personFollowEnabled && <ItemActionBar pdf={false} item={{ type: 'person', id: Number(personId) }} title={card.name} image={card.image} followLabel="اعلان اثر تازه" favoriteLabels={{ off: 'دنبال‌کردن فیلم‌ها', on: 'دنبال می‌کنید' }} />}
          </div>
        </div>
      </div>
    </section>
    {anchors.length > 1 && <nav className="cb-anchors" aria-label="بخش‌های صفحه"><div className="container">{anchors.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</div></nav>}
    <div className="container md-body cb-body">
      {(knownTitles.length + knownAlbums.length) > 1 && <section className="cb-known" aria-labelledby="cb-known-title">
        <header className="md-shelf-head"><h2 id="cb-known-title">شناخته‌شده برای</h2></header>
        <div className="cb-known-row">{knownTitles.map((item) => <PosterCard key={`t${item.id}`} item={item} fa />)}{knownAlbums.map((album) => <AlbumCard key={`a${album.id}`} album={album} fa />)}</div>
      </section>}
      {shelves.length > 0 && <div id="cb-films" className="cb-group">{shelves.map((shelf) => <section key={shelf.key} className="cb-shelf" aria-labelledby={`cb-${shelf.key}`}>
        <header className="md-shelf-head"><h2 id={`cb-${shelf.key}`}>{shelf.title} <small>{fa(shelf.result!.total)} اثر</small></h2>{shelf.result!.total > shelf.result!.titles.length && <Link href={shelf.href} className="md-more">همه</Link>}</header>
        <div className="cb-posters">{shelf.result!.titles.map((item) => <PosterCard key={item.id} item={item} fa />)}</div>
      </section>)}</div>}
      {tracks.length > 0 && <section id="cb-songs" className="mu-panel cb-shelf"><header className="md-shelf-head"><h2>آهنگ‌ها <small>{fa(card.songs)} آهنگ</small></h2></header><TrackList tracks={tracks} /></section>}
      {songs && songs.albums.length > 0 && <div id="cb-albums"><Shelf tone="music" title="آلبوم‌ها">{songs.albums.map((album) => <AlbumCard key={album.id} album={album} fa />)}</Shelf></div>}
      {credited.length > 0 && <div id="cb-credits" className="cb-group">{credited.map((group) => <section key={group.role} className="mu-panel cb-shelf"><header className="md-shelf-head"><h2>{`${group.name} در آهنگ‌های دیگران`}</h2></header><TrackList tracks={toPlayerTracks(group.tracks, true)} /></section>)}</div>}
      {team.length > 0 && <section id="cb-team" className="cb-team" aria-labelledby="cb-team-title">
        <header className="md-shelf-head"><h2 id="cb-team-title">همکاران {card.name}</h2></header>
        <div className="cb-grid is-compact">{team.map((mate) => <CelebrityCardView key={mate.id} person={mate} note={`${fa(mate.shared)} کار مشترک`} />)}</div>
      </section>}
      {(bio || person.cinemaBio) && <section id="cb-bio" className="mu-panel md-prose cb-bio"><h2>بیوگرافی</h2>{bio ? <div dangerouslySetInnerHTML={{ __html: withTextDirections(bio) }} /> : <p>{plainText(person.cinemaBio)}</p>}</section>}
      {factTexts.length > 0 && <section id="cb-facts-more" className="mu-panel cb-bio cb-facts-more">{factTexts.map((fact) => <div key={fact.code}><h2>{fact.label}</h2><p>{fact.text}</p></div>)}</section>}
    </div>
  </MediaShell>
}
