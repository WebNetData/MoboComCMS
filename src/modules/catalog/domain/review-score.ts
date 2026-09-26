export type ReviewCriteria = { quality: number; value: number; usability: number }

/** The published score is derived on the server; a client cannot submit a different average. */
export function reviewScore(input: unknown): { rating: number; criteria: ReviewCriteria } | null {
  if (!input || typeof input !== 'object') return null
  const data = input as Record<string, unknown>
  const raw = data.criteria && typeof data.criteria === 'object'
    ? data.criteria as Record<string, unknown>
    : { quality: data.rating, value: data.rating, usability: data.rating }
  const numbers = [raw.quality, raw.value, raw.usability].map(Number)
  if (numbers.some(value => !Number.isSafeInteger(value) || value < 1 || value > 5)) return null
  const [quality, value, usability] = numbers
  return { rating: Math.round((quality + value + usability) / 3), criteria: { quality, value, usability } }
}
