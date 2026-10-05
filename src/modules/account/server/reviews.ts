import { isModuleEnabled } from '@/extensions/server/modules'
import { ITEM_LABEL, isItemType, type ItemType } from '@/modules/content/domain/items'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { memberProductReviews } from '@/modules/catalog/server/member-reviews'
import { memberItemReviews } from '@/modules/reviews/server/reviews'
import { memberPostComments } from '@/modules/journal/server/member-comments'

// "My reviews": everything the member has rated or reviewed, from the shared
// reviews (software, games, films, music) and the store's product reviews,
// in one private list. Each owner keeps its own records and rules; this only
// reads them. A disabled module's reviews are left out, not deleted.
// Shared reviews can be edited and deleted from the list through the reviews
// module's own API; a product review is written once, by the store's rule.
// Article comments are listed too, so a member can see which are still waiting
// for a moderator or were not approved; they carry no rating.

const PAGE = 10
const MAX_PAGES = 50

export type MemberReview = {
  key: string
  kind: 'item' | 'product' | 'comment'
  label: string
  rating: number
  title: string
  body: string
  status: string
  updatedAt: Date
  /** The reviewed item as it is public now; null when it is no longer available. */
  target: { title: string; url: string; image: string } | null
  /** Shared reviews only: what the member's edit and delete address ("game:12"), its type, badge and dimension scores. */
  manage: { item: string; itemType: ItemType; verified: string; scores: Record<string, number> } | null
}

export async function memberReviewPage(userId: number, pageInput: unknown) {
  const page = Number.isSafeInteger(Number(pageInput)) && Number(pageInput) > 0 ? Math.min(Number(pageInput), MAX_PAGES) : 1
  // Both sources are ordered alike, so the first `page * PAGE` rows of each hold every row of this page.
  const take = page * PAGE
  const [reviewsOn, storeOn, journalOn] = await Promise.all([isModuleEnabled('reviews'), isStoreEnabled(), isModuleEnabled('journal')])
  const [items, products, comments] = await Promise.all([
    reviewsOn ? memberItemReviews(userId, take) : { total: 0, reviews: [] },
    storeOn ? memberProductReviews(userId, take) : { total: 0, reviews: [] },
    journalOn ? memberPostComments(userId, take) : { total: 0, comments: [] },
  ])
  const merged: MemberReview[] = [
    ...items.reviews.map((row): MemberReview => ({
      key: `item:${row.id}`, kind: 'item', label: isItemType(row.itemType) ? ITEM_LABEL[row.itemType].one : '', rating: row.rating, title: '', body: row.body, status: row.status, updatedAt: row.updatedAt, target: row.item,
      manage: isItemType(row.itemType) ? { item: `${row.itemType}:${row.itemId}`, itemType: row.itemType, verified: row.verified, scores: row.scores } : null,
    })),
    ...products.reviews.map((row): MemberReview => ({
      key: `product:${row.id}`, kind: 'product', label: 'محصول', rating: row.rating, title: row.title, body: row.body, status: row.status, updatedAt: row.updatedAt, target: row.product, manage: null,
    })),
    ...comments.comments.map((row): MemberReview => ({
      key: `comment:${row.id}`, kind: 'comment', label: row.reply ? 'پاسخ زیر مقاله' : 'دیدگاه مقاله', rating: 0, title: '', body: row.body, status: row.status, updatedAt: row.updatedAt, target: row.post, manage: null,
    })),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.key < b.key ? 1 : -1))
  const total = items.total + products.total + comments.total
  const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE))
  return { total, page, pages, reviews: merged.slice((page - 1) * PAGE, page * PAGE) }
}
