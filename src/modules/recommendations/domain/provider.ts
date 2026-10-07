import type { ItemRef, ItemType } from '@/modules/content/domain/items'

// The contract between the engine that builds a member's private suggestions and whatever answers
// "what goes with this item?". The engine owns consent, the signals it may read, the bounds and what is
// shown; a provider only answers for one kind of item. Each kind has one provider, and it can be replaced.

/** Where a seed came from: the member follows its creator, saved it, rated it highly, listened to it, or only looked at it. */
export type SeedKind = 'follow' | 'favorite' | 'rated' | 'listen' | 'view'
export type Seed = { ref: ItemRef; kind: SeedKind }
/** One candidate with the reason shown to the member. A provider's score says how well it goes with the seed, never how popular it is. */
export type Suggestion = { item: ItemRef; score: number; reason: string }

export interface RecommendationProvider {
  /** Names the provider in logs and checks. */
  id: string
  /** The kind of item this provider answers for. */
  seedType: ItemType
  /** Candidates for one live seed, best first, at most `take`. Only items the public can open now. */
  suggest(seed: ItemRef, context: { now: Date; take: number }): Promise<Suggestion[]>
}

/**
 * How much the member's own signal adds to a provider's score: what they chose deliberately (followed,
 * saved, rated highly) counts above what they listened to repeatedly, and that above a page they opened.
 */
export const SEED_WEIGHT: Record<SeedKind, number> = { follow: 3, favorite: 3, rated: 3, listen: 2, view: 0 }

/** The least rating (out of 5) at which a review says "more like this". */
export const RATED_SEED_MIN = 4

/** Keeps what a provider may return: a known shape, a finite score, within the take. A provider that misbehaves gives nothing. */
export function cleanSuggestions(value: unknown, take: number): Suggestion[] {
  if (!Array.isArray(value)) return []
  const out: Suggestion[] = []
  for (const row of value) {
    const item = (row as Suggestion | null)?.item
    if (!item || typeof item.type !== 'string' || !Number.isSafeInteger(item.id) || item.id <= 0) continue
    const score = Number((row as Suggestion).score)
    if (!Number.isFinite(score)) continue
    out.push({ item: { type: item.type, id: item.id }, score, reason: String((row as Suggestion).reason || '').slice(0, 200) })
    if (out.length >= take) break
  }
  return out
}
