import Link from '@/components/AppLink'
import { isModuleEnabled } from '@/extensions/server/modules'
import { studioProductReviews } from '@/modules/studios/server/reviews'

export function StudioReviewCards({ reviews }: { reviews: Awaited<ReturnType<typeof studioProductReviews>>['items'] }) {
  return <ul className="org-review-list">{reviews.map((review) => <li key={review.id}>
    <div className="org-review-top"><Link href={`${review.item.url}#reviews`}>{review.item.title}</Link><span aria-label={`امتیاز ${review.rating} از ۵`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>
    <p>{review.body}</p>
    <small>{review.author} · {review.createdAt.toLocaleDateString('fa-IR')}</small>
  </li>)}</ul>
}

export default async function StudioReviews({ studioId, enabled }: { studioId: number; enabled: { games: boolean; software: boolean } }) {
  if (!await isModuleEnabled('reviews')) return null
  const { items, total } = await studioProductReviews(studioId, enabled)
  if (!items.length) return null
  return <section className="org-reviews" aria-labelledby="org-reviews-title">
    <header><div><span>تجربهٔ کاربران</span><h2 id="org-reviews-title">دیدگاه‌ها دربارهٔ محصولات این سازنده</h2></div>{total > items.length && <Link href={`/studios/${studioId}/reviews`}>همهٔ دیدگاه‌ها ←</Link>}</header>
    <StudioReviewCards reviews={items} />
  </section>
}
