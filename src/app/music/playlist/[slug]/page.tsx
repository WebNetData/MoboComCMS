import type { Metadata } from 'next'
import ManageBar from '@/components/admin/ManageBar'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getPlaylist } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { formatDuration } from '@/modules/media/domain/media'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { VipBadge, VipGate } from '@/components/media/MediaCards'
import { PlayButton, TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getPlaylist(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  return { title: fa ? `پلی‌لیست ${data.playlist.title}` : `${data.playlist.titleEn || data.playlist.title} playlist`, description: data.playlist.description || undefined, alternates: { canonical: toPublicPath(`/music/playlist/${data.playlist.slug}`) } }
}

export default async function PlaylistPage({ params }: Props) {
  await requireModule('music')
  const [{ slug }, locale, viewer] = await Promise.all([params, getServerLocale(), getViewer()])
  const data = await getPlaylist(slug)
  if (!data) notFound()
  const fa = locale === 'fa'
  const { playlist } = data
  const locked = playlist.access === 'MEMBERS' && !viewer.member
  // Non-members get a short preview of a members-only playlist.
  const tracks = toPlayerTracks(locked ? data.tracks.slice(0, 3) : data.tracks, fa)
  const total = data.tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
  const name = fa ? playlist.title : playlist.titleEn || playlist.title
  const cover = playlist.cover || data.tracks[0]?.cover || ''
  return (
    <MediaShell section="music" active="playlists" nav={musicNav(fa)} search={{ action: '/music/browse', placeholder: fa ? 'جست‌وجوی آهنگ یا خواننده…' : 'Search songs or artists…' }}>
      <ManageBar title="مدیریت پلی‌لیست" anyOf={['music.manage', 'cms.posts']} links={[{ href: `/admin/music/library?tab=playlists&edit=${playlist.id}`, label: 'ویرایش پلی‌لیست' }, { href: '/admin/music/library?tab=playlists', label: 'همهٔ پلی‌لیست‌ها' }]} />
      <section className="mu-detail-hero is-playlist">
        <div className="mu-hero-bg" style={cover ? { backgroundImage: `url("${cover.replace(/"/g, '%22')}")` } : undefined} aria-hidden="true" />
        <div className="container mu-detail-inner">
          <div className="mu-detail-cover is-album">{cover ? <img src={cover} alt={name} /> : <span className="mu-noart">♫</span>}</div>
          <div className="mu-detail-info">
            <span className="md-eyebrow">{fa ? 'پلی‌لیست' : 'Playlist'}</span>
            <h1>{name}</h1>
            {playlist.description && <p className="mu-detail-desc">{playlist.description}</p>}
            <div className="mu-hero-tags">
              <span>{data.tracks.length.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'آهنگ' : 'tracks'}</span>
              {total > 0 && <span dir="ltr">⏱ {formatDuration(total)}</span>}
              {playlist.access === 'MEMBERS' && <VipBadge fa={fa} />}
            </div>
            <div className="mu-hero-actions">{tracks.length > 0 && <PlayButton tracks={tracks} index={0} variant="big" label={fa ? 'پخش همه' : 'Play all'} />}</div>
          </div>
        </div>
      </section>
      <div className="container md-body">
        {locked && <VipGate fa={fa} loggedIn={!!viewer.userId} next={`/music/playlist/${playlist.slug}`} title={fa ? 'این پلی‌لیست مخصوص اعضای VIP است' : 'This playlist is for VIP members'} />}
        <section className="mu-panel"><TrackList tracks={tracks} /></section>
      </div>
    </MediaShell>
  )
}
