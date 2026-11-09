export const SUPPORT_SOURCE_TYPES = [
  { id: 'product', label: 'محصولات' }, { id: 'post', label: 'مجله' },
  { id: 'software', label: 'نرم‌افزار' }, { id: 'game', label: 'بازی' }, { id: 'title', label: 'فیلم و سریال' },
  { id: 'album', label: 'آلبوم' }, { id: 'track', label: 'آهنگ' },
] as const
export type SupportSourceType = typeof SUPPORT_SOURCE_TYPES[number]['id']
export type KnowledgeSettings = { enabled: boolean; types: SupportSourceType[]; maxSources: number }
export const DEFAULT_KNOWLEDGE: KnowledgeSettings = { enabled: true, types: ['product', 'post'], maxSources: 3 }
export function normalizeKnowledge(value: unknown): KnowledgeSettings {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return { enabled: v.enabled !== false, types: Array.isArray(v.types) ? [...new Set(v.types.filter((x): x is SupportSourceType => SUPPORT_SOURCE_TYPES.some(t => t.id === x)))] : [...DEFAULT_KNOWLEDGE.types], maxSources: Math.max(1, Math.min(5, Math.floor(Number(v.maxSources)) || 3)) }
}
