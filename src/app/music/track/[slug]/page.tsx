import type { Metadata } from 'next'
import { renderEditorialText, richTextToPlain } from '@/shared/content/sanitize'
import { primaryTerms } from '@/modules/taxonomy/server/taxonomy'
import ManageBar from '@/components/admin/ManageBar'
import { ItemActionBar, ReviewSection } from '@/components/engage/Engagement'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { getModuleSettings, requireModule } from '@/extensions/server/modules'
import { getTrack } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { trackDownloadHref } from '@/modules/downloads/server/guard'
import { DownloadNotice } from '@/components/media/DownloadExtras'
import { paywallView } from '@/modules/paywall/server/paywall'
import BuyContent from '@/components/paywall/BuyContent'
import { formatDuration } from '@/modules/media/domain/media'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { VipBadge, VipGate } from '@/components/media/MediaCards'
import { PlayButton, TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import { toPublicPath } from '@/platform/routing/aliases'
import { getMusicSettings } from '@/modules/music/server/admin'
import { safeJsonLd } from '@/shared/seo/json-ld'
import AddToPersonalPlaylist from '@/components/media/AddToPersonalPlaylist'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getTrack(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  const tr = data.track
  const title = `${fa ? tr.title : tr.titleEn || tr.title} — ${fa ? tr.artist.name : tr.artist.nameEn || tr.artist.name}`
  return { title: fa ? `دانلود آهنگ ${title}` : title, description: fa ? `پخش آنلاین و دانلود آهنگ ${title}${tr.hasHq ? ' با کیفیت ۳۲۰' : ''}` : `Listen and download ${title}`, openGraph: { images: tr.cover ? [tr.cover] : undefined, type: 'music.song' }, alternates: { canonical: toPublicPath(`/music/track/${tr.slug}`) } }
}

export default async function TrackPage({ params }: Props) {
  await requireModule('music')
  const [{ slug }, locale, viewer, settings, layout] = await Promise.all([params, getServerLocale(), getViewer(), getModuleSettings('music'), getMusicSettings()])
  const data = await getTrack(slug, { recommendations: layout.showRelatedTracks })
  if (!data) notFound()
  const fa = locale === 'fa'
  const { track } = data
  const language = (await primaryTerms('music-language', [track.id])).get(track.id) || null
  const self = toPlayerTracks([track], fa)
  const album = toPlayerTracks(data.albumTracks, fa)
  const inAlbum = album.findIndex((item) => item.id === track.id)
  const queue = inAlbum >= 0 ? album : self
  // A price (on the track or its album) replaces the VIP gates: buying opens playback, HQ and downloads.
  const paywall = await paywallView(viewer, [{ ownerType: 'track', ownerId: track.id }, ...(track.album ? [{ ownerType: 'album' as const, ownerId: track.album.id }] : [])])
  const locked = paywall ? !paywall.open : track.access === 'MEMBERS' && !viewer.opens
  const dlLocked = locked || (!paywall && settings['download-members-only'] === true && !viewer.opens)
  const hqLocked = locked || (!paywall && settings['hq-members-only'] !== false && !viewer.opens)
  const lockHref = paywall ? '#buy' : '/vip'
  const lockTag = paywall ? '' : ' (VIP)'
  const name = fa ? track.title : track.titleEn || track.title
  const artistName = fa ? track.artist.name : track.artist.nameEn || track.artist.name
  const jsonLd = { '@context': 'https://schema.org', '@type': 'MusicRecording', name, byArtist: { '@type': 'MusicGroup', name: artistName }, ...(track.duration ? { duration: `PT${Math.floor(track.duration / 60)}M${track.duration % 60}S` } : {}), ...(track.album ? { inAlbum: { '@type': 'MusicAlbum', name: track.album.title } } : {}), ...(track.cover ? { image: track.cover } : {}) }

  return (
    <MediaShell section="music" nav={musicNav(fa)} search={{ action: '/music/browse', placeholder: fa ? 'جست‌وجوی آهنگ یا خواننده…' : 'Search songs or artists…' }}>
      <ManageBar title="مدیریت آهنگ" anyOf={['music.manage']} links={[{ href: `/admin/music/library?tab=tracks&edit=${track.id}`, label: 'ویرایش آهنگ' }, { href: '/admin/music/library?tab=tracks', label: 'همهٔ آهنگ‌ها' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <section className="mu-detail-hero">
        <div className="mu-hero-bg" style={track.cover ? { backgroundImage: `url("${track.cover.replace(/"/g, '%22')}")` } : undefined} aria-hidden="true" />
        <div className="container mu-detail-inner">
          <div className="mu-detail-cover">{track.cover ? <img src={track.cover} alt={name} /> : <span className="mu-noart">♪</span>}</div>
          <div className="mu-detail-info">
            <span className="md-eyebrow">{track.album ? (fa ? 'از آلبوم' : 'From the album') : (fa ? 'تک‌آهنگ' : 'Single')}{track.album && <> · <Link href={`/music/album/${track.album.slug}`}>{fa ? track.album.title : track.album.titleEn || track.album.title}</Link></>}</span>
            <h1>{name}</h1>
            <Link href={`/music/artist/${track.artist.slug}`} className="mu-detail-artist">{track.artist.image && <img src={track.artist.image} alt="" />}{artistName}</Link>
            <div className="mu-hero-tags">
              {track.genre && <Link href={`/music/browse?genre=${encodeURIComponent(track.genre.split(',')[0].trim())}`}>{track.genre}</Link>}
              {language && <Link href={language.path}>{fa ? 'زبان' : 'Language'}: {language.name}</Link>}
              {track.duration > 0 && <span dir="ltr">⏱ {formatDuration(track.duration)}</span>}
              <span>▶ {track.plays.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'پخش' : 'plays'}</span>
              {track.access === 'MEMBERS' && <VipBadge fa={fa} />}
            </div>
            <DownloadNotice />
            <div className="mu-hero-actions" id="downloads">
              {track.hasAudio && <PlayButton tracks={queue} index={Math.max(0, inAlbum)} variant="big" label={fa ? 'پخش آهنگ' : 'Play'} />}
              {track.hasAudio && (dlLocked
                ? <Link className="btn btn-ghost md-locked-btn" href={lockHref}>🔒 {fa ? `دانلود ۱۲۸${lockTag}` : `Download 128${lockTag}`}</Link>
                : <a className="btn btn-ghost" href={await trackDownloadHref(track.id, viewer.userId, false)} rel="nofollow">⤓ {fa ? 'دانلود ۱۲۸' : 'Download 128'}</a>)}
              {track.hasHq && (hqLocked || dlLocked
                ? <Link className="btn btn-ghost md-locked-btn" href={lockHref}>🔒 {fa ? `دانلود ۳۲۰${lockTag}` : `Download 320${lockTag}`}</Link>
                : <a className="btn btn-ghost" href={await trackDownloadHref(track.id, viewer.userId, true)} rel="nofollow">⤓ {fa ? 'دانلود ۳۲۰' : 'Download 320'}</a>)}
            </div>
            <ItemActionBar item={{ type: 'track', id: track.id }} title={name} image={track.cover} />
            <AddToPersonalPlaylist trackId={track.id} trackSlug={track.slug} loggedIn={!!viewer.userId} fa={fa} />
          </div>
        </div>
      </section>

      <div className="container md-body">
        {paywall && !paywall.open && <BuyContent view={paywall} loggedIn={!!viewer.userId} next={`/music/track/${track.slug}#buy`} noun={paywall.key.startsWith('album:') ? 'آلبوم' : 'آهنگ'} />}
        {paywall?.open && paywall.reason === 'purchased' && <span className="pw-owned">✓ {fa ? 'این مورد را خریده‌اید' : 'You own this'}</span>}
        {!paywall && locked && <VipGate fa={fa} loggedIn={!!viewer.userId} next={`/music/track/${track.slug}`} title={fa ? 'این آهنگ مخصوص اعضای VIP است' : 'This track is for VIP members'} />}
        <div className="mu-columns">
          {layout.showLyrics && <section className="mu-panel">
            <header className="md-shelf-head"><h2>{fa ? 'متن آهنگ' : 'Lyrics'}</h2></header>
            {track.lyrics ? <div className={`mu-lyrics prose${locked ? ' is-teaser' : ''}`} dangerouslySetInnerHTML={{ __html: renderEditorialText(locked ? richTextToPlain(track.lyrics, 300) : track.lyrics) }} /> : <p className="muted">{fa ? 'متن این آهنگ هنوز ثبت نشده است.' : 'No lyrics yet.'}</p>}
          </section>}
          {album.length > 1 ? (
            <section className="mu-panel">
              <header className="md-shelf-head"><h2>{fa ? 'آهنگ‌های این آلبوم' : 'On this album'}</h2></header>
              <TrackList tracks={album} showCover={false} />
            </section>
          ) : data.moreFromArtist.length > 0 && (
            <section className="mu-panel">
              <header className="md-shelf-head"><h2>{fa ? `بیشتر از ${artistName}` : `More from ${artistName}`}</h2></header>
              <TrackList tracks={toPlayerTracks(data.moreFromArtist, fa)} />
            </section>
          )}
        </div>
        {data.relatedTracks.length > 0 && <section className="mu-panel" aria-labelledby="music-related-tracks">
          <header className="md-shelf-head"><h2 id="music-related-tracks">{fa ? 'آهنگ‌های هم‌سبک' : 'Similar tracks'}</h2></header>
          <TrackList tracks={toPlayerTracks(data.relatedTracks, fa)} reasons={data.relatedTracks.map(item => fa ? item.recommendationReason : 'Shared genre')} />
        </section>}
        <ReviewSection item={{ type: 'track', id: track.id }} title={name} path={`/music/track/${track.slug}`} />
        {album.length > 1 && data.moreFromArtist.length > 0 && (
          <section className="mu-panel">
            <header className="md-shelf-head"><h2>{fa ? `بیشتر از ${artistName}` : `More from ${artistName}`}</h2><Link href={`/music/artist/${track.artist.slug}`} className="md-more">{fa ? 'صفحه هنرمند ←' : 'Artist page →'}</Link></header>
            <TrackList tracks={toPlayerTracks(data.moreFromArtist, fa)} />
          </section>
        )}
      </div>
    </MediaShell>
  )
}
