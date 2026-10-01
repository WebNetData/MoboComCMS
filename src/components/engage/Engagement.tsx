import { isModuleEnabled } from '@/extensions/server/modules'
import { COMPARABLE, FAVORITABLE, REVIEWABLE, itemKey, type ItemRef } from '@/modules/content/domain/items'
import { getViewer } from '@/modules/membership/server/membership'
import { itemEngagement } from '@/modules/reviews/server/reviews'
import ItemActions from '@/components/engage/ItemActions'
import RecentViewTracker from '@/components/engage/RecentViewTracker'
import ReviewForm from '@/components/engage/ReviewForm'

const num = (value: number) => value.toLocaleString('fa-IR')
const Stars = ({ value, label }: { value: number; label: string }) => (
  <span className="rv-stars" role="img" aria-label={label}>
    {[1, 2, 3, 4, 5].map((n) => <span key={n} className={value >= n - 0.25 ? 'is-on' : value >= n - 0.75 ? 'is-half' : ''} aria-hidden="true">★</span>)}
  </span>
)

/** Favorite / follow / compare buttons for an item hero. Renders nothing when both modules are off. */
export async function ItemActionBar({ item, title, image, followLabel }: { item: ItemRef; title: string; image?: string; followLabel?: string }) {
  const [reviewsOn, compareOn] = await Promise.all([isModuleEnabled('reviews'), isModuleEnabled('compare')])
  const canFavorite = reviewsOn && FAVORITABLE.includes(item.type)
  const canCompare = compareOn && COMPARABLE.includes(item.type)
  const viewer = await getViewer()
  const data = canFavorite ? await itemEngagement(item, viewer.userId) : null
  return <><ItemActions item={itemKey(item)} title={title} image={image} loggedIn={!!viewer.userId} favorite={data?.favorite || null} favorites={data?.favorites || 0} canFavorite={canFavorite} canCompare={canCompare} followLabel={followLabel} />{viewer.userId && <RecentViewTracker item={itemKey(item)} />}</>
}

/** Rating summary, the member's review form and approved reviews for an item. */
export async function ReviewSection({ item, title, path }: { item: ItemRef; title: string; path: string }) {
  if (!REVIEWABLE.includes(item.type) || !await isModuleEnabled('reviews')) return null
  const viewer = await getViewer()
  const data = await itemEngagement(item, viewer.userId)
  const { summary } = data
  const max = Math.max(1, ...summary.distribution)
  return (
    <section className="rv-section" id="reviews" aria-labelledby="reviews-title">
      <h2 id="reviews-title">امتیاز و نظر کاربران</h2>
      <div className="rv-top">
        <div className="rv-score">
          <strong>{summary.average !== null ? summary.average.toLocaleString('fa-IR', { minimumFractionDigits: 1 }) : '—'}</strong>
          <Stars value={summary.average || 0} label={summary.average !== null ? `میانگین ${summary.average} از ۵` : 'هنوز امتیازی ثبت نشده'} />
          <small>{summary.count ? `${num(summary.count)} امتیاز` : 'هنوز امتیازی ثبت نشده'}</small>
        </div>
        <ol className="rv-bars" aria-label="توزیع امتیازها">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = summary.distribution[stars - 1]
            return <li key={stars}><span>{num(stars)} ★</span><span className="rv-bar"><span style={{ width: `${(count / max) * 100}%` }} /></span><span>{num(count)}</span></li>
          })}
        </ol>
        <div className="rv-cta"><ReviewForm item={itemKey(item)} mine={data.mine} loggedIn={!!viewer.userId} title={title} path={path} /></div>
      </div>
      {data.reviews.length > 0 ? (
        <ul className="rv-list">
          {data.reviews.map((review) => (
            <li key={review.id} className={review.mine ? 'is-mine' : ''}>
              <span className="rv-avatar" style={{ background: review.author.color }} aria-hidden="true">{review.author.name.slice(0, 1)}</span>
              <div>
                <p className="rv-head"><b>{review.author.name}</b><Stars value={review.rating} label={`${review.rating} از ۵`} /><time dateTime={review.createdAt.toISOString()}>{review.createdAt.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })}</time></p>
                <p className="rv-body" dir="auto">{review.body}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="muted rv-none">هنوز نظری نوشته نشده است؛ اولین نفر باشید.</p>}
      {data.total > data.reviews.length && <p className="muted">{num(data.total - data.reviews.length)} نظر دیگر…</p>}
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
