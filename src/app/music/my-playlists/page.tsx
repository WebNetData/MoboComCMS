import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import { listPersonalPlaylists } from '@/modules/music/server/personal-playlists'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import MyPlaylistsClient from './MyPlaylistsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پلی‌لیست‌های من | My playlists', robots: { index: false } }

export default async function MyPlaylistsPage() {
  await requireModule('music')
  const [viewer, locale] = await Promise.all([getViewer(), getServerLocale()])
  if (!viewer.userId) redirect('/login?next=/music/my-playlists')
  const fa = locale === 'fa'
  const rows = await listPersonalPlaylists(viewer.userId)
  return <MediaShell section="music" active="mine" nav={musicNav(fa)}>
    <div className="container md-body">
      <header className="md-page-head"><div><span className="md-eyebrow">{fa ? 'کتابخانهٔ شخصی' : 'Your library'}</span><h1>{fa ? 'پلی‌لیست‌های من' : 'My playlists'}</h1><p className="muted">{fa ? 'پلی‌لیست‌های شما فقط در حساب خودتان دیده می‌شوند.' : 'Your playlists are private to your account.'}</p></div></header>
      <MyPlaylistsClient initial={rows} fa={fa} />
    </div>
  </MediaShell>
}
