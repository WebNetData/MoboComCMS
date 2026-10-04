import type { ItemRef } from '@/modules/content/domain/items'

export type RecommendationSignal = 'topic' | 'creator' | 'platform' | 'kind' | 'freshness'
export type ContextualRecommendation = { item: ItemRef; score: number; reason: string; signals: RecommendationSignal[] }

type Candidate = {
  id: number
  topics: string[]
  creators: (number | null)[]
  platforms: string[]
  kind?: string
  publishedAt: Date
}

export type ContextualSource = Candidate & { type: 'game' | 'software' | 'title' | 'album' | 'track' }

export function terms(value: string): string[] {
  return [...new Set(String(value || '').split(/[,،]/).map((part) => part.trim()).filter(Boolean))].slice(0, 12)
}

/** Deterministic, explainable contextual ranking. Engagement counters cannot raise a score. */
export function rankContextual(source: ContextualSource, candidates: Candidate[], take = 8): ContextualRecommendation[] {
  const topics = new Set(source.topics.map((value) => value.toLocaleLowerCase()))
  const platforms = new Set(source.platforms.map((value) => value.toLocaleLowerCase()))
  const creators = new Set(source.creators.filter((id): id is number => !!id))
  const hasContext = topics.size > 0 || platforms.size > 0 || creators.size > 0 || !!source.kind
  const ranked = candidates.filter((candidate) => candidate.id !== source.id).map((candidate) => {
    const sharedTopic = candidate.topics.find((value) => topics.has(value.toLocaleLowerCase()))
    const topicCount = new Set(candidate.topics.filter((value) => topics.has(value.toLocaleLowerCase())).map((value) => value.toLocaleLowerCase())).size
    const creator = candidate.creators.some((id) => !!id && creators.has(id))
    const platform = candidate.platforms.find((value) => platforms.has(value.toLocaleLowerCase()))
    const kind = !!source.kind && source.kind === candidate.kind
    const signals: RecommendationSignal[] = [
      ...(topicCount ? ['topic' as const] : []),
      ...(creator ? ['creator' as const] : []),
      ...(platform ? ['platform' as const] : []),
      ...(kind ? ['kind' as const] : []),
    ]
    const reason = sharedTopic ? source.type === 'software' ? `دستهٔ مشترک: ${sharedTopic}` : `سبک مشترک: ${sharedTopic}`
      : creator ? source.type === 'album' || source.type === 'track' ? 'هنرمند مشترک' : 'سازنده یا ناشر مشترک' : platform ? `پلتفرم مشترک: ${platform}` : kind ? 'نوع محتوای مشابه' : 'تازه منتشر شده'
    return { item: { type: source.type, id: candidate.id }, score: topicCount * 10 + Number(creator) * 6 + Number(!!platform) * 2 + Number(kind), reason, signals: signals.length ? signals : ['freshness' as const], publishedAt: candidate.publishedAt }
  }).filter((result) => !hasContext || result.score > 0)
  ranked.sort((a, b) => b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime() || a.item.id - b.item.id)
  return ranked.slice(0, Math.max(1, Math.min(12, Math.trunc(take) || 8))).map(({ publishedAt: _publishedAt, ...result }) => result)
}
