/** Rating and review rules shared by the API, pages and tests. */

export const REVIEW_MAX_LENGTH = 2000

export class ReviewError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Integer 1–5 or an error. */
export function normalizeRating(value: unknown): number {
  const rating = Number(value)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError('امتیاز باید بین ۱ تا ۵ ستاره باشد')
  return rating
}

/** Plain text review body: control characters and tags removed, whitespace collapsed. */
export function normalizeReviewBody(value: unknown): string {
  const body = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (body.length > REVIEW_MAX_LENGTH) throw new ReviewError(`متن نظر حداکثر ${REVIEW_MAX_LENGTH.toLocaleString('fa-IR')} حرف است`)
  if (body && body.length < 10) throw new ReviewError('متن نظر دست‌کم ۱۰ حرف باشد (یا فقط امتیاز بدهید)')
  return body
}

/**
 * Text reviews wait for approval when moderation is on; a bare star rating is
 * published right away. Rejected reviews never count towards the average.
 */
export const initialReviewStatus = (body: string, moderateText: boolean) => (body && moderateText ? 'PENDING' : 'APPROVED')

export type RatingSummary = { average: number | null; count: number; distribution: [number, number, number, number, number] }

export function summarize(ratings: number[]): RatingSummary {
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const rating of ratings) if (rating >= 1 && rating <= 5) distribution[rating - 1]++
  const count = distribution.reduce((sum, n) => sum + n, 0)
  const sum = distribution.reduce((total, n, index) => total + n * (index + 1), 0)
  return { average: count ? Math.round((sum / count) * 10) / 10 : null, count, distribution }
}
