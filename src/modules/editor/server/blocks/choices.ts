import { itemCards, searchItemCards } from '@/modules/content/server/registry'
import type { BlockDefinition } from '@/modules/editor/domain/registry'
import { publicItemSource } from '@/modules/editor/server/blocks/source'

/** Reuses the current public picker owner, including module visibility and protected-body boundaries. */
export async function moduleItemChoices(definition: BlockDefinition, query: unknown, inputIds: unknown) {
  const type = await publicItemSource(definition)
  if (!type) return { items: [], selected: [] }
  const ids = [...new Set((Array.isArray(inputIds) ? inputIds : []).filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, 24)
  const [items, selected] = await Promise.all([searchItemCards(String(query || '').slice(0, 100), [type], 20), itemCards(ids.map(id => ({ type, id })))])
  const row = (card: (typeof items)[number]) => ({ id: card.id, title: card.title })
  return { items: items.map(row), selected: ids.flatMap(id => { const card = selected.get(`${type}:${id}`); return card ? [row(card)] : [] }) }
}
