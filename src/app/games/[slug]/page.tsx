import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getGame } from '@/modules/media/server/queries'
import { gamePageExtras } from '@/modules/games/server/portal'
import { releaseState, LOCALIZATIONS, GAME_MODES } from '@/modules/games/domain/games'
import { getViewer } from '@/modules/membership/server/membership'
import { REQUIREMENT_KEYS, trailerSource } from '@/modules/media/domain/media'
import { toEmbedUrl } from '@/modules/site/domain/builder'
import MediaShell from '@/components/media/MediaShell'
import { VipBadge, VipGate } from '@/components/media/MediaCards'
import { GameRail } from '@/components/games/GamePortal'
import { Badges, InfoCard, NewsList, ReleasePill, ScoreCard, SectionNav, UpdatesTimeline } from '@/components/games/GameV2'
import LibraryButtons from '@/components/games/LibraryButtons'
import { Icon } from '@/components/media/PortalIcons'
import { primaryTerms } from '@/modules/taxonomy/server/taxonomy'
import LinkBox from '@/components/media/LinkBox'
import { paywallView } from '@/modules/paywall/server/paywall'
import BuyContent from '@/components/paywall/BuyContent'
import { ItemActionBar, ReviewSection, aggregateRating } from '@/components/engage/Engagement'
import Gallery from '@/components/media/Gallery'
import Trailer from '@/components/media/Trailer'
import { toPublicPath } from '@/platform/routing/aliases'
import { safeJsonLd } from '@/shared/seo/json-ld'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

const REQ_LABELS: Record<string, string> = { os: 'سیستم‌عامل', cpu: 'پردازنده', gpu: 'کارت گرافیک', ram: 'حافظه', storage: 'فضای خالی', directx: 'دایرکت‌ایکس' }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getGame(slug)
  if (!data) return {}
  const g = data.game
  const upcoming = releaseState(g.releaseDate).state === 'upcoming'
  return {
    title: g.seoTitle || (upcoming ? `بازی ${g.title}: تاریخ انتشار، تریلر و اطلاعات` : `نقد، بررسی و دانلود بازی ${g.title}`),
    description: (g.seoDescription || g.summary).slice(0, 180) || undefined,
    openGraph: { images: g.backdrop || g.cover ? [g.backdrop || g.cover] : undefined },
    alternates: { canonical: toPublicPath(`/games/${g.slug}`) },
  }
}

/** GameUp-style game page: hero, section nav, review with verdict, media, requirements, downloads, updates, news and member reviews; identity sidebar. */
export default async function GamePage({ params }: Props) {
  await requireModule('games')
  const [{ slug }, viewer] = await Promise.all([params, getViewer()])
  const data = await getGame(slug)
  if (!data) notFound()
  const { game: g } = data
  const extras = await gamePageExtras(g, viewer.userId ?? null)
  const paywall = await paywallView(viewer, [{ ownerType: 'game', ownerId: g.id }])
  const locked = paywall ? !paywall.open : g.access === 'MEMBERS' && !viewer.member
  const trailer = trailerSource(g.trailerUrl, toEmbedUrl)
  const req = g.requirements
  const hasReq = REQUIREMENT_KEYS.some((k) => req.min?.[k] || req.rec?.[k])
  const upcoming = releaseState(g.releaseDate).state === 'upcoming'
  const ref = { type: 'game' as const, id: g.id }
  const [rating, terms] = await Promise.all([aggregateRating(ref), primaryTerms('games', [g.id])])
  const term = terms.get(g.id)
  const facts = ([
    ['سازنده', g.developer && <Link href={`/games/browse?developer=${encodeURIComponent(g.developer)}`}>{g.developer}</Link>],
    ['ناشر', g.publisher && <Link href={`/games/browse?publisher=${encodeURIComponent(g.publisher)}`}>{g.publisher}</Link>],
    ['تاریخ انتشار', g.releaseDate ? new Date(g.releaseDate).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : 'اعلام نشده'],
    ['سبک', g.genres.join('، ')],
    ['مجموعه', extras.franchise && <Link href={`/games/franchise/${extras.franchise.slug}`}>{extras.franchise.title}</Link>],
    ['موتور بازی', g.engine && <bdi dir="ltr">{g.engine}</bdi>],
    ['حالت‌ها', g.modes.map((code) => GAME_MODES[code as keyof typeof GAME_MODES] || code).join('، ')],
    ['فارسی‌سازی', g.localization.map((code) => LOCALIZATIONS[code as keyof typeof LOCALIZATIONS] || code).join('، ')],
    ['رده سنی', g.ageRating],
    ['حجم', g.gameSize && <bdi dir="ltr">{g.gameSize}</bdi>],
    ['آخرین نسخه', g.version && <bdi dir="ltr">{g.version}</bdi>],
  ] as [string, React.ReactNode][]).filter(([, v]) => v)
  const sections = ([
    ['overview', 'معرفی', true],
    ['review', 'نقد و بررسی', !!g.content],
    ['media', 'تصاویر', g.screenshots.length > 0],
    ['requirements', 'سیستم مورد نیاز', hasReq],
    ['download', 'دانلود', true],
    ['updates', 'آپدیت‌ها', extras.updates.length > 0],
    ['news', 'اخبار', extras.news.length > 0],
    ['reviews', 'نظرات', true],
  ] as [string, string, boolean][]).filter(([, , on]) => on).map(([id, label]) => [id, label] as [string, string])
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'VideoGame', name: g.title, ...(g.titleEn ? { alternateName: g.titleEn } : {}),
    ...(rating ? { aggregateRating: rating } : {}), ...(g.cover ? { image: g.cover } : {}), ...(g.summary ? { description: g.summary.slice(0, 300) } : {}),
    gamePlatform: g.platforms, genre: g.genres, ...(g.releaseDate ? { datePublished: new Date(g.releaseDate).toISOString().slice(0, 10) } : {}),
    ...(g.developer ? { author: { '@type': 'Organization', name: g.developer } } : {}), ...(g.publisher ? { publisher: { '@type': 'Organization', name: g.publisher } } : {}),
    ...(g.modes.length ? { playMode: g.modes.map((mode) => (mode === 'SINGLE' ? 'SinglePlayer' : mode === 'COOP' ? 'CoOp' : 'MultiPlayer')) } : {}),
    ...(g.score != null ? { review: { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: g.score, bestRating: 100 }, author: { '@type': 'Organization', name: 'موبوکام' }, ...(g.verdict ? { reviewBody: g.verdict } : {}) } } : {}),
  }

  return (
    <MediaShell section="games">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <section className="gm-detail-hero gv-hero" style={g.backdrop ? { backgroundImage: `url("${g.backdrop.replace(/"/g, '%22')}")` } : undefined}>
        <span className="gm-hero-shade" aria-hidden="true" />
        <div className="container gm-detail-inner gv-hero-inner">
          <div className="gm-detail-cover">{g.cover ? <img src={g.cover} alt={g.title} /> : <span className="gm-noart"><Icon name="gamepad" size={48} /></span>}</div>
          <div className="gm-detail-info">
            <nav className="cn-crumbs" aria-label="مسیر صفحه"><Link href="/games">بازی</Link>{term ? term.chain.map((node) => <span key={node.path}> › <Link href={node.path}>{node.name}</Link></span>) : g.platforms[0] && <> › <Link href={`/games/browse?platform=${encodeURIComponent(g.platforms[0])}`}>{g.platforms[0]}</Link></>}</nav>
            <h1>{g.title}</h1>
            {g.titleEn && g.titleEn !== g.title && <p className="cn-hero-sub" dir="ltr">{g.titleEn}</p>}
            <div className="gv-hero-meta">
              <ReleasePill date={g.releaseDate} />
              <div className="gm-platforms is-large">{g.platforms.map((p) => <Link key={p} href={`/games/browse?platform=${encodeURIComponent(p)}`}>{p}</Link>)}</div>
            </div>
            <Badges editorsChoice={g.editorsChoice} localization={g.localization} />
            <div className="cn-hero-actions">
              {!upcoming && <a href="#download" className="btn gm-btn-primary"><Icon name="download" size={18} />{locked ? (paywall ? `خرید · ${paywall.price}` : 'دانلود ویژهٔ VIP') : 'دانلود بازی'}</a>}
              {g.content && <a href="#review" className="btn gm-btn-ghost"><Icon name="star" size={18} />نقد و بررسی</a>}
              <Trailer embed={trailer.embed} src={trailer.src} fa />
              {g.access === 'MEMBERS' && <VipBadge fa />}
            </div>
            {extras.library && <LibraryButtons gameId={g.id} initial={extras.library.mine} counts={extras.library.counts} loggedIn={!!viewer.userId} next={`/games/${g.slug}`} upcoming={upcoming} />}
          </div>
        </div>
      </section>
      <SectionNav items={sections} />

      <div className="container gv-body">
        <div className="gv-main">
          <section id="overview" className="gv-section">
            {g.summary && <p className="gv-lead">{g.summary}</p>}
            <ItemActionBar item={ref} title={g.title} image={g.cover} followLabel="آپدیت‌ها و لینک‌های جدید" />
          </section>
          {g.content && <article id="review" className="gv-section gv-review">
            <h2 className="gv-h2">نقد و بررسی {g.title}</h2>
            <div className="md-prose" dangerouslySetInnerHTML={{ __html: g.content }} />
            {(g.pros.length > 0 || g.cons.length > 0) && <div className="gm-verdict">
              {g.pros.length > 0 && <div className="is-pro"><h3>نقاط قوت</h3><ul>{g.pros.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
              {g.cons.length > 0 && <div className="is-con"><h3>نقاط ضعف</h3><ul>{g.cons.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
            </div>}
            {g.verdict && g.score !== null && <div className="gv-verdict"><span className="gv-verdict-score num">{g.score.toLocaleString('fa-IR')}</span><div><small>حکم نهایی</small><p>{g.verdict}</p></div></div>}
          </article>}
          {g.screenshots.length > 0 && <section id="media" className="gv-section"><h2 className="gv-h2">تصاویر {g.title}</h2><Gallery images={g.screenshots} fa /></section>}
          {hasReq && <section id="requirements" className="gv-section">
            <h2 className="gv-h2">سیستم مورد نیاز {g.title}</h2>
            <div className="gv-req-grid">
              {(['min', 'rec'] as const).filter((side) => REQUIREMENT_KEYS.some((k) => req[side]?.[k])).map((side) => <div key={side} className={`gv-req-col is-${side}`}>
                <h3>{side === 'min' ? 'حداقل سیستم' : 'سیستم پیشنهادی'}</h3>
                <dl>{REQUIREMENT_KEYS.filter((k) => req[side]?.[k]).map((k) => <div key={k}><dt>{REQ_LABELS[k]}</dt><dd dir="ltr">{req[side][k]}</dd></div>)}</dl>
              </div>)}
            </div>
          </section>}
          <section id="download" className="gv-section">
            <header className="gv-dl-head"><h2 className="gv-h2">دانلود بازی {g.title}</h2>{(g.version || g.gameSize) && <span>{g.version && <>نسخهٔ <bdi dir="ltr">{g.version}</bdi></>}{g.version && g.gameSize && ' · '}{g.gameSize && <>حجم <bdi dir="ltr">{g.gameSize}</bdi></>}</span>}</header>
            {upcoming && !data.links.length ? <p className="gv-empty">این بازی هنوز منتشر نشده است. با «می‌خواهم بازی کنم» یا دکمهٔ دنبال‌کردن، از انتشار و لینک‌های دانلود باخبر شوید.</p> : <>
              {paywall && !paywall.open && <BuyContent view={paywall} loggedIn={!!viewer.userId} next={`/games/${g.slug}#buy`} noun="بازی" />}
              {paywall?.open && paywall.reason === 'purchased' && <span className="pw-owned">✓ این بازی را خریده‌اید</span>}
              {!paywall && locked && <VipGate fa loggedIn={!!viewer.userId} next={`/games/${g.slug}`} title="دانلود این بازی مخصوص اعضای VIP است" />}
              <LinkBox links={data.links} fa member={viewer.member} loggedIn={!!viewer.userId} parentLocked={g.access === 'MEMBERS'} paywall={paywall} />
            </>}
          </section>
          <UpdatesTimeline updates={extras.updates} member={viewer.member} loggedIn={!!viewer.userId} locked={g.access === 'MEMBERS'} paywall={paywall} />
          <NewsList posts={extras.news} title={`اخبار و مقالات ${g.title}`} />
          <div id="reviews" className="gv-anchor"><ReviewSection item={ref} title={g.title} path={`/games/${g.slug}`} /></div>
        </div>
        <aside className="gv-aside">
          <ScoreCard score={g.score} verdict={g.verdict} member={extras.member} showMember={extras.settings.showMemberScore} />
          <InfoCard facts={facts} releases={g.releases} play={{ main: g.playMain, extra: g.playExtra, complete: g.playComplete }} stores={g.storeLinks} />
        </aside>
      </div>
      {extras.franchise && extras.franchise.games.length > 0 && <GameRail title={`دیگر بازی‌های مجموعهٔ ${extras.franchise.title}`} games={extras.franchise.games} more={`/games/franchise/${extras.franchise.slug}`} icon="apps" />}
      <GameRail title="بازی‌های مشابه" games={data.related} more={term?.path} icon="gamepad" />
    </MediaShell>
  )
}
