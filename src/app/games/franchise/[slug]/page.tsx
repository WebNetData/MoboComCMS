import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { franchisePage } from '@/modules/games/server/portal'
import MediaShell from '@/components/media/MediaShell'
import { scoreBand } from '@/modules/media/domain/media'
import { Icon } from '@/components/media/PortalIcons'
import { toPublicPath } from '@/platform/routing/aliases'
import { shareCard } from '@/modules/site/server/seo'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
const year = (value: Date | null | undefined) => (value ? new Date(value).getUTCFullYear().toLocaleString('fa-IR', { useGrouping: false }) : '')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await franchisePage((await params).slug)
  if (!data) return {}
  return shareCard({ title: `مجموعهٔ بازی‌های ${data.franchise.title}`, description: (data.franchise.description || `همهٔ نسخه‌های ${data.franchise.title} به ترتیب انتشار`).slice(0, 180), alternates: { canonical: toPublicPath(`/games/franchise/${data.franchise.slug}`) }, openGraph: { images: data.franchise.image ? [data.franchise.image] : undefined } })
}

/** A series: banner and every title as a release-order timeline. */
export default async function FranchisePage({ params }: Props) {
  await requireModule('games')
  const data = await franchisePage((await params).slug)
  if (!data) notFound()
  const { franchise, games } = data
  return (
    <MediaShell section="games">
      <section className="gv-fr-hero" style={franchise.image ? { backgroundImage: `url("${encodeURI(franchise.image)}")` } : undefined}>
        <span className="gv-fr-veil" aria-hidden="true" />
        <div className="container gv-fr-inner">
          <nav className="gx-crumbs" aria-label="مسیر صفحه"><Link href="/games">بازی</Link> › <Link href="/games/franchises">مجموعه‌ها</Link></nav>
          <h1>مجموعهٔ {franchise.title}</h1>
          {franchise.titleEn && <p dir="ltr" className="gv-fr-en">{franchise.titleEn}</p>}
          <div className="gv-fr-stats">
            <span><b className="num">{games.length.toLocaleString('fa-IR')}</b><small>بازی</small></span>
            {data.average !== null && <span><b className="num">{data.average.toLocaleString('fa-IR')}</b><small>میانگین نمره</small></span>}
            {data.span[0] && <span><b className="num">{year(data.span[0])}{data.span[1] && year(data.span[1]) !== year(data.span[0]) ? `–${year(data.span[1])}` : ''}</b><small>سال‌های انتشار</small></span>}
          </div>
          {franchise.description && <p className="gv-fr-desc">{franchise.description}</p>}
        </div>
      </section>
      <div className="container gv-page">
        <ol className="gv-fr-line">{games.map((game) => <li key={game.id}>
          <span className="gv-fr-year num">{year(game.releaseDate) || 'به‌زودی'}</span>
          <Link href={`/games/${game.slug}`} className="gv-fr-card">
            {game.cover ? <img src={game.cover} alt="" loading="lazy" /> : <span className="gv-cal-ph"><Icon name="gamepad" size={20} /></span>}
            <span><b>{game.title}</b><small>{game.platforms.join(' · ')}</small>{game.summary && <p>{game.summary}</p>}</span>
            {game.score !== null && <span className={`gm-score band-${scoreBand(game.score)}`}>{game.score.toLocaleString('fa-IR')}</span>}
          </Link>
        </li>)}</ol>
      </div>
    </MediaShell>
  )
}
