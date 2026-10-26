import type { Metadata } from 'next'
import ManageBar from '@/components/admin/ManageBar'
import { ItemActionBar, ReviewSection } from '@/components/engage/Engagement'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getAlbum } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { formatDuration } from '@/modules/media/domain/media'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { AlbumCard, Shelf, VipBadge, VipGate, yr } from '@/components/media/MediaCards'
import { paywallView } from '@/modules/paywall/server/paywall'
import BuyContent from '@/components/paywall/BuyContent'
import { PlayButton, TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import { toPublicPath } from '@/platform/routing/aliases'
import { withTextDirections } from '@/modules/editor/domain/rich-text'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getAlbum(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  const a = data.album
  const title = `${fa ? a.title : a.titleEn || a.title} — ${fa ? a.artist.name : a.artist.nameEn || a.artist.name}`
  return { title: fa ? `دانلود آلبوم ${title}` : `${title} (album)`, openGraph: { images: a.cover ? [a.cover] : undefined }, alternates: { canonical: toPublicPath(`/music/album/${a.slug}`) } }
}

export default async function AlbumPage({ params }: Props) {
  await requireModule('music')
  const [{ slug }, locale, viewer] = await Promise.all([params, getServerLocale(), getViewer()])
  const data = await getAlbum(slug)
  if (!data) notFound()
  const fa = locale === 'fa'
  const { album } = data
  const tracks = toPlayerTracks(data.tracks, fa)
  const total = data.tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
  const name = fa ? album.title : album.titleEn || album.title
  const artistName = fa ? album.artist.name : album.artist.nameEn || album.artist.name
  const paywall = await paywallView(viewer, [{ ownerType: 'album', ownerId: album.id }])
  const locked = paywall ? !paywall.open : album.access === 'MEMBERS' && !viewer.opens
  return (
    <MediaShell section="music" active="albums" nav={musicNav(fa)} search={{ action: '/music/browse', placeholder: fa ? 'جست‌وجوی آهنگ یا خواننده…' : 'Search songs or artists…' }}>
      <ManageBar title="مدیریت آلبوم" anyOf={['music.manage']} links={[{ href: `/admin/music/library?tab=albums&edit=${album.id}`, label: 'ویرایش آلبوم' }, { href: '/admin/music/library?tab=albums', label: 'همهٔ آلبوم‌ها' }]} />
      <section className="mu-detail-hero">
        <div className="mu-hero-bg" style={album.cover ? { backgroundImage: `url("${album.cover.replace(/"/g, '%22')}")` } : undefined} aria-hidden="true" />
        <div className="container mu-detail-inner">
          <div className="mu-detail-cover is-album">{album.cover ? <img src={album.cover} alt={name} /> : <span className="mu-noart">♪</span>}</div>
          <div className="mu-detail-info">
            <span className="md-eyebrow">{fa ? album.albumTypeName || 'آلبوم' : album.albumType === 'ALBUM' ? 'Album' : album.albumType}{album.year ? ` · ${yr(album.year, fa)}` : ''}</span>
            <h1>{name}</h1>
            <Link href={`/music/artist/${album.artist.slug}`} className="mu-detail-artist">{album.artist.image && <img src={album.artist.image} alt="" />}{artistName}</Link>
            <div className="mu-hero-tags">
              <span>{tracks.length.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'قطعه' : 'tracks'}</span>
              {total > 0 && <span dir="ltr">⏱ {formatDuration(total)}</span>}
              {album.genre && <span>{album.genre}</span>}
              {album.access === 'MEMBERS' && <VipBadge fa={fa} />}
            </div>
            <div className="mu-hero-actions">{tracks.length > 0 && <PlayButton tracks={tracks} index={0} variant="big" label={fa ? 'پخش آلبوم' : 'Play album'} />}</div>
            <ItemActionBar item={{ type: 'album', id: album.id }} title={name} image={album.cover} followLabel="آهنگ‌های جدید" />
          </div>
        </div>
      </section>
      <div className="container md-body">
        {paywall && !paywall.open && <BuyContent view={paywall} loggedIn={!!viewer.userId} next={`/music/album/${album.slug}#buy`} noun="آلبوم" />}
        {paywall?.open && paywall.reason === 'purchased' && <span className="pw-owned">✓ {fa ? 'این آلبوم را خریده‌اید' : 'You own this album'}</span>}
        {!paywall && locked && <VipGate fa={fa} loggedIn={!!viewer.userId} next={`/music/album/${album.slug}`} title={fa ? 'این آلبوم مخصوص اعضای VIP است' : 'This album is for VIP members'} />}
        <section className="mu-panel"><TrackList tracks={tracks} showCover={false} /></section>
        {album.description && <section className="mu-panel md-prose" dangerouslySetInnerHTML={{ __html: withTextDirections(album.description) }} />}
        <ReviewSection item={{ type: 'album', id: album.id }} title={name} path={`/music/album/${album.slug}`} />
        {data.related.length > 0 && <Shelf tone="music" title={fa ? 'آلبوم‌های مرتبط' : 'Related albums'}>{data.related.map((item) => <AlbumCard key={item.id} album={item} fa={fa} />)}</Shelf>}
      </div>
    </MediaShell>
  )
}
