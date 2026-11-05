import { isModuleEnabled } from '@/extensions/server/modules'
import { COMPARABLE, FAVORITABLE, REVIEWABLE, itemKey, type ItemRef } from '@/modules/content/domain/items'
import { getViewer } from '@/modules/membership/server/membership'
import { itemEngagement } from '@/modules/reviews/server/reviews'
import { dimensionsFor } from '@/modules/reviews/domain/dimensions'
import PdfDownload from '@/components/content/PdfDownload'
import ItemActions from '@/components/engage/ItemActions'
import RecentViewTracker from '@/components/engage/RecentViewTracker'
import ReviewForm from '@/components/engage/ReviewForm'
import ReviewList from '@/components/engage/ReviewList'
import { RATING_LABELS, RatingMeter, ratingTone } from '@/components/engage/RatingMeter'

const num = (value: number) => value.toLocaleString('fa-IR')
/** What earns the verified badge for each kind of item (shown to a member who has not earned it yet). */
const BADGE_HINT: Partial<Record<ItemRef['type'], string>> = {
  software: 'دانلود یا خرید', game: 'دانلود یا خرید', title: 'تماشا، دانلود یا خرید', album: 'شنیدن، دانلود یا خرید', track: 'شنیدن، دانلود یا خرید',
}

/** Favorite / follow / compare buttons for an item hero. Renders nothing when both modules are off. */
export async function ItemActionBar({ item, title, image, followLabel, favoriteLabels, pdf = true }: { item: ItemRef; title: string; image?: string; followLabel?: string; favoriteLabels?: { off: string; on: string }; pdf?: boolean }) {
  const [reviewsOn, compareOn] = await Promise.all([isModuleEnabled('reviews'), isModuleEnabled('compare')])
  const canFavorite = reviewsOn && FAVORITABLE.includes(item.type)
  const canCompare = compareOn && COMPARABLE.includes(item.type)
  const viewer = await getViewer()
  const data = canFavorite ? await itemEngagement(item, viewer.userId) : null
  return <><ItemActions pdf={pdf ? <PdfDownload item={itemKey(item)}/> : undefined} item={itemKey(item)} title={title} image={image} loggedIn={!!viewer.userId} favorite={data?.favorite || null} favorites={data?.favorites || 0} canFavorite={canFavorite} canCompare={canCompare} followLabel={followLabel} favoriteLabels={favoriteLabels} />{viewer.userId && <RecentViewTracker item={itemKey(item)} />}</>
}

/**
 * Rating summary, the member's review form and approved reviews for an item.
 * `anchor={false}` leaves out the `reviews` id for a page that already wraps the section in its own anchor.
 */
export async function ReviewSection({ item, title, path, anchor = true }: { item: ItemRef; title: string; path: string; anchor?: boolean }) {
  if (!REVIEWABLE.includes(item.type) || !await isModuleEnabled('reviews')) return null
  const viewer = await getViewer()
  const data = await itemEngagement(item, viewer.userId, 1, { viewerExperience: true })
  const { summary } = data
  const max = Math.max(1, ...summary.distribution)
  const dimensions = dimensionsFor(item.type).map(({ key, label, hint }) => ({ key, label, hint }))
  // Share of each star count among all ratings, and how full the score ring is.
  const share = (count: number) => (summary.count ? Math.round((count / summary.count) * 100) : 0)
  const fill = summary.average !== null ? Math.round((summary.average / 5) * 100) : 0
  return (
    <section className="rv-section" id={anchor ? 'reviews' : undefined} aria-labelledby="reviews-title">
      <header className="rv-heading">
        <span className="rv-eyebrow">تجربهٔ کاربران</span>
        <h2 id="reviews-title">امتیاز و نظر کاربران</h2>
        <p>{summary.count ? `بر پایهٔ ${num(summary.count)} امتیاز${data.total ? ` و ${num(data.total)} نظر نوشته‌شده` : ''}` : 'هنوز کسی امتیاز نداده است؛ اولین نفر باشید.'}</p>
      </header>
      <div className="rv-top">
        <div className="rv-score">
          <div className={`rv-ring tone-${ratingTone(summary.average)}`} style={{ ['--rv-fill' as string]: `${fill}%` }}>
            <strong>{summary.average !== null ? summary.average.toLocaleString('fa-IR', { minimumFractionDigits: 1 }) : '—'}</strong>
            <span aria-hidden="true">از ۵</span>
          </div>
          {summary.average !== null && <b className={`rv-verdict tone-${ratingTone(summary.average)}`}>{RATING_LABELS[ratingTone(summary.average)]}</b>}
          <RatingMeter size="lg" value={summary.average} label={summary.average !== null ? `میانگین ${summary.average} از ۵` : 'هنوز امتیازی ثبت نشده'} />
          <small>{summary.count ? `${num(summary.count)} امتیاز` : 'هنوز امتیازی ثبت نشده'}</small>
          {data.verifiedCount > 0 && <span className="rv-badge" title="بر پایهٔ سابقهٔ خود موبوکام">✓ {num(data.verifiedCount)} تجربهٔ تأییدشده</span>}
        </div>
        <ol className="rv-bars" aria-label="توزیع امتیازها">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = summary.distribution[stars - 1]
            return <li key={stars}><span className="rv-bar-star"><i className={`tone-${stars}`} aria-hidden="true" />{num(stars)}<span className="sr-only"> از ۵</span></span><span className={`rv-bar tone-${stars}`} aria-hidden="true"><span style={{ width: `${(count / max) * 100}%` }} /></span><span className="rv-bar-count" aria-label={`${num(count)} امتیاز`}>{num(share(count))}٪</span></li>
          })}
        </ol>
        <div className="rv-cta"><ReviewForm item={itemKey(item)} mine={data.mine} loggedIn={!!viewer.userId} title={title} path={path} dimensions={dimensions} experience={data.experience} badgeHint={BADGE_HINT[item.type] || ''} /></div>
      </div>
      {(data.dimensions.length > 0 || data.verifiedCount > 0) && <div className="rv-dims">
        {data.dimensions.length > 0 && <>
          <h3>امتیاز تخصصی</h3>
          <ul aria-label="میانگین امتیازهای تخصصی">
            {data.dimensions.map((dimension) => <li key={dimension.key}>
              <span>{dimension.label}</span>
              <b>{dimension.average.toLocaleString('fa-IR', { minimumFractionDigits: 1 })}</b>
              <span className={`rv-bar tone-${ratingTone(dimension.average)}`} aria-hidden="true"><span style={{ width: `${(dimension.average / 5) * 100}%` }} /></span>
              <small>{num(dimension.count)} رأی</small>
            </li>)}
          </ul>
        </>}
        {data.verifiedCount > 0 && <p className="rv-verified-note"><span className="rv-badge" aria-hidden="true">✓</span> {num(data.verifiedCount)} نفر از امتیازدهندگان این مورد را در موبوکام دانلود، تماشا، گوش یا خریداری کرده‌اند.</p>}
      </div>}
      <ReviewList key={itemKey(item)} item={itemKey(item)} initial={data.reviews.map((review) => ({ ...review, createdAt: review.createdAt.toISOString() }))} initialTotal={data.total} initialPages={data.pages} loggedIn={!!viewer.userId} dimensions={dimensions} verifiedCount={data.verifiedCount} />
    </section>
  )
}

/** schema.org AggregateRating for JSON-LD, when an item has ratings. */
export async function aggregateRating(item: ItemRef) {
  if (!await isModuleEnabled('reviews')) return undefined
  const data = await itemEngagement(item, null)
  return data.summary.count && data.summary.average !== null
    ? { '@type': 'AggregateRating', ratingValue: data.summary.average, ratingCount: data.summary.count, bestRating: 5, worstRating: 1 }
    : undefined
}
