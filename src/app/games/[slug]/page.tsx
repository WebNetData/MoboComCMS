import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getGame } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { REQUIREMENT_KEYS, trailerSource } from '@/modules/media/domain/media'
import { toEmbedUrl } from '@/modules/site/domain/builder'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { gamesNav } from '@/components/media/nav'
import { GameCard, ScoreBadge, Shelf, VipBadge, VipGate } from '@/components/media/MediaCards'
import LinkBox from '@/components/media/LinkBox'
import Gallery from '@/components/media/Gallery'
import Trailer from '@/components/media/Trailer'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

const REQ_LABELS: Record<string, [string, string]> = { os: ['سیستم‌عامل', 'OS'], cpu: ['پردازنده', 'Processor'], gpu: ['کارت گرافیک', 'Graphics'], ram: ['حافظه', 'Memory'], storage: ['فضای خالی', 'Storage'], directx: ['دایرکت‌ایکس', 'DirectX'] }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getServerLocale()])
  const data = await getGame(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  const g = data.game
  const name = fa ? g.title : g.titleEn || g.title
  return { title: fa ? `نقد و دانلود بازی ${name}` : `${name} — review & download`, description: g.summary.slice(0, 180) || undefined, openGraph: { images: g.backdrop || g.cover ? [g.backdrop || g.cover] : undefined }, alternates: { canonical: `/games/${g.slug}` } }
}

export default async function GamePage({ params }: Props) {
  await requireModule('games')
  const [{ slug }, locale, viewer] = await Promise.all([params, getServerLocale(), getViewer()])
  const data = await getGame(slug)
  if (!data) notFound()
  const fa = locale === 'fa'
  const { game: g } = data
  const name = fa ? g.title : g.titleEn || g.title
  const locked = g.access === 'MEMBERS' && !viewer.member
  const trailer = trailerSource(g.trailerUrl, toEmbedUrl)
  const req = g.requirements
  const hasReq = REQUIREMENT_KEYS.some((k) => req.min?.[k] || req.rec?.[k])
  const released = g.releaseDate ? new Date(g.releaseDate) : null
  const facts: [string, string][] = [
    [fa ? 'سازنده' : 'Developer', g.developer],
    [fa ? 'ناشر' : 'Publisher', g.publisher],
    [fa ? 'تاریخ انتشار' : 'Release', released ? released.toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''],
    [fa ? 'سبک' : 'Genre', g.genres.join('، ')],
    [fa ? 'رده سنی' : 'Age rating', g.ageRating],
  ].filter(([, v]) => v) as [string, string][]
  const jsonLd = { '@context': 'https://schema.org', '@type': 'VideoGame', name, ...(g.cover ? { image: g.cover } : {}), ...(g.summary ? { description: g.summary.slice(0, 300) } : {}), gamePlatform: g.platforms, genre: g.genres, ...(g.developer ? { author: { '@type': 'Organization', name: g.developer } } : {}), ...(g.score != null ? { review: { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: g.score, bestRating: 100 }, author: { '@type': 'Organization', name: 'Editors' } } } : {}) }

  return (
    <MediaShell section="games" nav={gamesNav(fa)} search={{ action: '/games/browse', placeholder: fa ? 'جست‌وجوی بازی…' : 'Search games…' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="gm-detail-hero" style={g.backdrop ? { backgroundImage: `url("${g.backdrop.replace(/"/g, '%22')}")` } : undefined}>
        <span className="gm-hero-shade" aria-hidden="true" />
        <div className="container gm-detail-inner">
          <div className="gm-detail-cover">{g.cover ? <img src={g.cover} alt={name} /> : <span className="gm-noart">🎮</span>}</div>
          <div className="gm-detail-info">
            <nav className="cn-crumbs"><Link href="/games">{fa ? 'بازی' : 'Games'}</Link>{g.platforms[0] && <> / <Link href={`/games/browse?platform=${encodeURIComponent(g.platforms[0])}`}>{g.platforms[0]}</Link></>}</nav>
            <h1>{name}</h1>
            {g.titleEn && fa && g.titleEn !== g.title && <p className="cn-hero-sub" dir="ltr">{g.titleEn}</p>}
            <div className="gm-platforms is-large">{g.platforms.map((p) => <Link key={p} href={`/games/browse?platform=${encodeURIComponent(p)}`}>{p}</Link>)}</div>
            {g.summary && <p className="cn-summary">{g.summary}</p>}
            <div className="cn-hero-actions">
              <a href="#download" className="btn gm-btn-primary">{locked ? `♛ ${fa ? 'ویژه VIP' : 'VIP only'}` : `⤓ ${fa ? 'دانلود بازی' : 'Download'}`}</a>
              <Trailer embed={trailer.embed} src={trailer.src} fa={fa} />
              {g.access === 'MEMBERS' && <VipBadge fa={fa} />}
            </div>
          </div>
          <div className="gm-scores">
            <ScoreBadge score={g.score} fa={fa} size="lg" />
            {g.userScore != null && <span className="gm-user-score"><b>{g.userScore.toLocaleString(fa ? 'fa-IR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b><small>{fa ? 'نمره کاربران' : 'User score'}</small></span>}
          </div>
        </div>
      </section>

      <div className="container md-body gm-detail-body">
        <div className="gm-main">
          {g.screenshots.length > 0 && <section className="md-shelf"><header className="md-shelf-head"><h2>{fa ? 'تصاویر بازی' : 'Screenshots'}</h2></header><Gallery images={g.screenshots} fa={fa} /></section>}
          {g.content && <article className="mu-panel md-prose gm-review"><h2>{fa ? 'نقد و بررسی' : 'Review'}</h2><div dangerouslySetInnerHTML={{ __html: g.content }} /></article>}
          {(g.pros.length > 0 || g.cons.length > 0) && (
            <section className="gm-verdict">
              {g.pros.length > 0 && <div className="is-pro"><h3>{fa ? 'نقاط قوت' : 'Pros'}</h3><ul>{g.pros.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
              {g.cons.length > 0 && <div className="is-con"><h3>{fa ? 'نقاط ضعف' : 'Cons'}</h3><ul>{g.cons.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
            </section>
          )}
          {hasReq && (
            <section className="mu-panel gm-req">
              <h2>{fa ? 'سیستم مورد نیاز' : 'System requirements'}</h2>
              <table>
                <thead><tr><th /><th>{fa ? 'حداقل' : 'Minimum'}</th><th>{fa ? 'پیشنهادی' : 'Recommended'}</th></tr></thead>
                <tbody>{REQUIREMENT_KEYS.filter((k) => req.min?.[k] || req.rec?.[k]).map((k) => <tr key={k}><th>{REQ_LABELS[k][fa ? 0 : 1]}</th><td dir="ltr">{req.min?.[k] || '—'}</td><td dir="ltr">{req.rec?.[k] || '—'}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          <section id="download" className="cn-watch">
            <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'دانلود' : 'Download'}</span><h2>{fa ? 'لینک‌های دانلود' : 'Download links'}</h2></div></header>
            {locked && <VipGate fa={fa} loggedIn={!!viewer.userId} next={`/games/${g.slug}`} title={fa ? 'دانلود این بازی مخصوص اعضای VIP است' : 'This download is for VIP members'} />}
            <LinkBox links={data.links} fa={fa} member={viewer.member} loggedIn={!!viewer.userId} parentLocked={g.access === 'MEMBERS'} />
          </section>
        </div>
        <aside className="gm-aside">
          <dl className="gm-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </aside>
      </div>
      {data.related.length > 0 && <div className="container"><Shelf tone="games" title={fa ? 'بازی‌های مشابه' : 'Similar games'}>{data.related.map((game) => <GameCard key={game.id} game={game} fa={fa} />)}</Shelf></div>}
    </MediaShell>
  )
}
