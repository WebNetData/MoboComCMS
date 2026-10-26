import type { Metadata } from 'next'
import ManageBar from '@/components/admin/ManageBar'
import { notFound, permanentRedirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getArtist } from '@/modules/media/server/queries'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { AlbumCard, EmptyState, Shelf } from '@/components/media/MediaCards'
import { PlayButton, TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import { toPublicPath } from '@/platform/routing/aliases'
import { ItemActionBar } from '@/components/engage/Engagement'
import { withTextDirections } from '@/modules/editor/domain/rich-text'
import { plainText } from '@/shared/text/plain'
import { getMusicSettings } from '@/modules/music/server/admin'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getArtist(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  const name = fa ? data.artist.name : data.artist.nameEn || data.artist.name
  return { title: fa ? `آهنگ‌های ${name}` : `${name} — songs & albums`, description:plainText(data.artist.bio).slice(0,160)||(fa ? `آهنگ‌ها و آلبوم‌های ${name}؛ دانلود و پخش آنلاین با بهترین کیفیت.` : `Songs and albums by ${name}: download and listen online.`), openGraph: { images: data.artist.image ? [data.artist.image] : undefined }, alternates: { canonical: toPublicPath(`/music/artist/${data.artist.slug}`) } }
}

export default async function ArtistPage({ params }: Props) {
  await requireModule('music')
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getArtist(slug)
  const presentation = await getMusicSettings(true)
  if (!data) notFound()
  if (data.artist.slug !== slug) permanentRedirect(toPublicPath(`/music/artist/${encodeURIComponent(data.artist.slug)}`))
  const fa = locale === 'fa'
  const { artist } = data
  const name = fa ? artist.name : artist.nameEn || artist.name
  const tracks = toPlayerTracks(data.tracks, fa)
  const banner = artist.cover || artist.image
  return (
    <MediaShell section="music" active="artists" nav={musicNav(fa)} search={{ action: '/music/browse', placeholder: fa ? 'جست‌وجوی آهنگ یا خواننده…' : 'Search songs or artists…' }}>
      <ManageBar title="مدیریت هنرمند" anyOf={['music.manage']} links={[{ href: `/admin/music/artists?edit=${artist.id}`, label: 'ویرایش هنرمند' }, { href: '/admin/music/artists', label: 'همهٔ هنرمندان' }]} />
      <section className="mu-artist-hero" style={banner ? { backgroundImage: `url("${banner.replace(/"/g, '%22')}")` } : undefined}>
        <div className="container mu-artist-inner">
          <span className="mu-artist-avatar">{artist.image ? <img src={artist.image} alt={name} /> : <i>{name.slice(0, 1)}</i>}</span>
          <div>
            <span className="md-eyebrow">{fa ? 'هنرمند' : 'Artist'}</span>
            <h1>{name}</h1>
            <p className="muted">{tracks.length.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'آهنگ' : 'songs'} · {data.albums.length.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'آلبوم' : 'albums'}</p>
            {tracks.length > 0 && <div className="mu-hero-actions"><PlayButton tracks={tracks} index={0} variant="big" label={fa ? 'پخش محبوب‌ترین‌ها' : 'Play top songs'} /></div>}
            {presentation.showArtistFollow && <ItemActionBar item={{ type: 'artist', id: artist.id }} title={name} image={artist.image} followLabel={fa ? 'آهنگ‌های تازه' : 'new tracks'} />}
          </div>
        </div>
      </section>
      <div className="container md-body">
        {!tracks.length && !data.albums.length && <EmptyState fa={fa} />}
        {tracks.length > 0 && <section className="mu-panel"><header className="md-shelf-head"><h2>{fa ? 'آهنگ‌های محبوب' : 'Popular'}</h2></header><TrackList tracks={tracks} /></section>}
        {data.albums.length > 0 && <Shelf tone="music" title={fa ? 'آلبوم‌ها' : 'Albums'}>{data.albums.map((album) => <AlbumCard key={album.id} album={album} fa={fa} />)}</Shelf>}
        {presentation.showArtistBiography && artist.bio && <section className="mu-panel md-prose"><h2>{fa ? 'بیوگرافی' : 'Biography'}</h2><div dangerouslySetInnerHTML={{ __html: withTextDirections(artist.bio) }} /></section>}
      </div>
    </MediaShell>
  )
}
