import type { ItemRef } from '@/modules/content/domain/items'
import { itemCards, latestItemCards, type ItemCard } from '@/modules/content/server/registry'
import { closedSectionPlugins } from '@/modules/site/server/maintenance'
import { logEvent } from '@/platform/observability/logger'
import type { MoboComDocument } from '@/modules/editor/domain/document'
import type { BlockRegistry } from '@/modules/editor/domain/registry'
import { documentHtml } from '@/modules/editor/domain/render'
import { moduleBlocks, MODULE_BLOCK_LIMIT, withoutSyncedPatterns } from '@/modules/editor/domain/module-blocks'
import { readDocument } from '@/modules/editor/domain/validate'
import { db } from '@/platform/database/prisma'
import { moduleBlockRenderer } from '@/modules/editor/server/blocks/registry'
import { publicItemsHtml } from '@/modules/editor/server/blocks/items'
import { publicItemSource } from '@/modules/editor/server/blocks/source'

/**
 * A synced pattern's current blocks. A missing pattern shows nothing; references inside a pattern are dropped, so the
 * render is one level deep and a pattern can never include itself.
 */
async function syncedPatternHtml(id: number, registry: BlockRegistry, preview: boolean): Promise<string> {
  if (!Number.isSafeInteger(id) || id <= 0) return ''
  const row = await db.editorPattern.findFirst({ where: { id, kind: 'synced' }, select: { contentDocument: true } })
  if (!row) return ''
  const read = readDocument(row.contentDocument, registry)
  if (!read.ok) logEvent('warn', 'editor.synced_pattern_unreadable', { id, issues: read.issues.slice(0, 5) })
  const inner = await publicDocumentHtml({ ...read.document, blocks: withoutSyncedPatterns(read.document.blocks) }, registry, preview)
  return `<div class="mcb mcb-content-pattern" data-pattern="${id}">${inner}</div>`
}

/** Per-render work only: no user content or results retained in global module state. */
export async function publicDocumentHtml(document: MoboComDocument, registry: BlockRegistry, preview = false): Promise<string> {
  const blocks = moduleBlocks(document, registry).slice(0, MODULE_BLOCK_LIMIT)
  const html = new Map<string, string>(), queries = new Map<string, Promise<ItemCard[]>>(), patterns = new Map<number, Promise<string>>()
  const sources = new Map<string, ReturnType<typeof publicItemSource>>()
  const closed = blocks.length ? await closedSectionPlugins() : new Set<string>()
  const resolve = async (block: (typeof blocks)[number]) => {
    const definition = registry.get(block.type)!
    if (definition.owner && closed.has(definition.owner)) { html.set(block.id, ''); return }
    try {
      if (definition.dataSource?.kind === 'pattern') {
        const id = Number(block.props.pattern)
        let pattern = patterns.get(id)
        if (!pattern) { pattern = syncedPatternHtml(id, registry, preview); patterns.set(id, pattern) }
        html.set(block.id, await pattern); return
      }
      const render = moduleBlockRenderer(block.type)
      if (render) { html.set(block.id, await render(block, definition)); return }
      let source = sources.get(definition.type)
      if (!source) { source = publicItemSource(definition, closed); sources.set(definition.type, source) }
      const type = await source
      if (!type) { html.set(block.id, ''); return }
      const limit = Math.min(24, Math.max(1, Number(block.props.limit) || 6))
      const selected = block.props.source === 'selected'
      const ids = [...new Set((Array.isArray(block.props.items) ? block.props.items : []).map(item => Number((item as { id?: unknown }).id)).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, limit)
      const key = JSON.stringify([type, selected, ids, limit])
      let query = queries.get(key)
      if (!query) {
        query = selected ? itemCards(ids.map(id => ({ type, id }) as ItemRef)).then(cards => ids.flatMap(id => { const card = cards.get(`${type}:${id}`); return card ? [card] : [] })) : latestItemCards(type, limit)
        queries.set(key, query)
      }
      html.set(block.id, publicItemsHtml(block, definition, await query))
    } catch (error) {
      logEvent('error', 'editor.module_block_failed', { type: block.type, error })
      if (preview) throw error
      html.set(block.id, definition.dataSource?.kind === 'pattern' ? '' : publicItemsHtml(block, definition, [], true))
    }
  }
  // Bound concurrent owner reads independently of document size; duplicate selections share one query.
  for (let offset = 0; offset < blocks.length; offset += 4) await Promise.all(blocks.slice(offset, offset + 4).map(resolve))
  return documentHtml(document, registry, block => html.get(block.id) ?? (registry.get(block.type)?.owner ? '' : undefined))
}
