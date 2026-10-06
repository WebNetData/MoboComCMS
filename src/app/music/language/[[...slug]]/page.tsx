import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { tracksByIds } from '@/modules/media/server/queries'
import { resolveTermPath, termTree } from '@/modules/taxonomy/server/taxonomy'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { EmptyState } from '@/components/media/MediaCards'
import { TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import Pager from '@/components/media/Pager'
import TermHeader from '@/components/taxonomy/TermHeader'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug?: string[] }>; searchParams: Promise<{ page?: string }> }
const TAXONOMY = 'music-language'

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page }] = await Promise.all([params, searchParams])
  if (!slug?.length) return { title: 'موزیک بر اساس زبان و گویش', description: 'آهنگ‌ها به تفکیک زبان و گویش: فارسی، ترکی، لری، مازندرانی و دیگر زبان‌ها', alternates: { canonical: toPublicPath('/music/language') } }
  const found = await resolveTermPath(TAXONOMY, slug)
  if (!found) return { title: 'پیدا نشد', robots: { index: false } }
  const n = Number(page) || 1
  const title = found.term.seoTitle || `آهنگ‌های ${found.chain.map((node) => node.name).join(' ')}`
  return {
    title: n > 1 ? `${title} — صفحه ${n.toLocaleString('fa-IR')}` : title,
    description: found.term.seoDescription || found.term.description || `دانلود و پخش آنلاین آهنگ‌های ${found.term.name}`,
    alternates: { canonical: toPublicPath(n > 1 ? `${found.term.path}?page=${n}` : found.term.path) },
  }
}

/**
 * Music by language or dialect. Without a path: the languages there are. With one: the songs filed under
 * that language and everything under it (a dialect under its language).
 */
export default async function MusicLanguagePage({ params, searchParams }: Props) {
  await requireModule('music')
  const [{ slug }, query] = await Promise.all([params, searchParams])

  if (!slug?.length) {
    const roots = await termTree(TAXONOMY)
    return (
      <MediaShell section="music" active="languages" nav={musicNav(true)}>
        <div className="container md-body">
          <header className="md-page-head"><h1>زبان و گویش</h1><p className="muted">آهنگ‌ها را به زبان یا گویش دلخواهتان بشنوید.</p></header>
          {roots.length ? <ul className="mu-langs">{roots.map((term) => (
            <li key={term.id}>
              <Link href={term.path} className="mu-lang" style={term.color ? { ['--lang' as string]: term.color } : undefined}>
                <b>{term.name}</b><small>{term.count.toLocaleString('fa-IR')} آهنگ</small>
              </Link>
              {term.children.length > 0 && <p className="mu-lang-subs">{term.children.map((child) => <Link key={child.id} href={child.path}>{child.name}</Link>)}</p>}
            </li>
          ))}</ul> : <EmptyState fa title="هنوز زبانی تعریف نشده است" />}
        </div>
      </MediaShell>
    )
  }

  const found = await resolveTermPath(TAXONOMY, slug)
  if (!found) notFound()
  const result = await tracksByIds(found.ownerIds, Number(query.page) || 1)
  return (
    <MediaShell section="music" active="languages" nav={musicNav(true)}>
      <div className="container md-body">
        <TermHeader section={{ label: 'زبان و گویش', href: '/music/language' }} chain={found.chain} term={found.term} children={found.children} siblings={found.siblings} total={result.total} itemLabel="آهنگ" />
        {result.tracks.length ? <div className="mu-panel"><TrackList tracks={toPlayerTracks(result.tracks, true)} /></div> : <EmptyState fa title="هنوز آهنگی در این زبان نیست" />}
        <Pager page={result.page} pages={result.pages} fa href={(n) => (n > 1 ? `${found.term.path}?page=${n}` : found.term.path)} />
      </div>
    </MediaShell>
  )
}
