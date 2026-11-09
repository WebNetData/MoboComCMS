import { searchSite } from '@/modules/search/server/search'
import { itemCards } from '@/modules/content/server/registry'
import { itemKey, type ItemType } from '@/modules/content/domain/items'
import { policyPassages, supportPath, type KnowledgeSettings, type SupportSource, type SupportSourceType } from '../domain/knowledge'

export async function supportSources(query: string, policy: string, settings: KnowledgeSettings): Promise<SupportSource[]> {
  const sources: SupportSource[] = [{ id: 1, title: 'راهنمای بخش‌های موبوکام', href: '', text: 'سفارش‌ها /dashboard/orders، تیکت /dashboard/tickets، خدمات /dashboard/services، کیف پول /dashboard/wallet. برای قیمت و موجودی به صفحهٔ جاری محصول مراجعه کنید؛ این راهنما سند قیمت یا موجودی نیست.' }]
  for (const passage of policyPassages(policy, query)) sources.push({ id: sources.length + 1, title: 'راهنمای پشتیبانی سایت', href: '', text: passage })
  if (!settings.enabled || !settings.types.length) return sources
  const found = await searchSite({ q: query.slice(0, 100), log: false, suggestion: true })
  const refs = found.hits.filter(h => settings.types.includes(h.type as SupportSourceType) && h.access === 'PUBLIC').slice(0, 12).map(h => ({ type: h.type, id: h.id }))
  // Reload current cards: a stale indexed snippet is never sent to the assistant.
  const cards = await itemCards(refs)
  let used = 0
  for (const ref of refs) {
    const card = cards.get(itemKey(ref))
    if (!card || card.access !== 'PUBLIC' || !supportPath(card.url) || !settings.types.includes(card.type as SupportSourceType)) continue
    sources.push({ id: sources.length + 1, title: card.title.slice(0, 120), href: card.url, text: `${card.title}\n${card.subtitle}\n${card.summary}`.slice(0, 1100), ref: { type: ref.type as SupportSourceType, id: ref.id }, updatedAt: card.updatedAt.toISOString() })
    if (++used >= settings.maxSources) break
  }
  return sources
}

export async function sourcesStillPublic(sources: SupportSource[]) {
  const referenced = sources.filter(s => s.ref)
  if (!referenced.length) return true
  const cards = await itemCards(referenced.map(s => ({ type: s.ref!.type as ItemType, id: s.ref!.id })))
  return referenced.every(source => { const card = cards.get(itemKey(source.ref!)); return card?.access === 'PUBLIC' && card.url === source.href && `${card.title}\n${card.subtitle}\n${card.summary}`.slice(0, 1100) === source.text })
}
