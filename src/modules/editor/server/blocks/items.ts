import type { ItemCard } from '@/modules/content/server/registry'
import type { MoboComBlock } from '@/modules/editor/domain/document'
import type { BlockDefinition } from '@/modules/editor/domain/registry'
import { safeAssetSrc } from '@/modules/editor/domain/fields'
import { escapeHtml, safeLinkHref } from '@/modules/editor/domain/rich-text'

/** Canonical public cards, escaped here. No price/stock/private body or stored engine markup. */
export function publicItemsHtml(block: MoboComBlock, definition: BlockDefinition, cards: readonly ItemCard[], error = false): string {
  const title = String(block.props.title || ''), id = `mcb-title-${block.id}`
  const columns = block.props.columns as Record<string, unknown>
  const classes = ['desktop', 'tablet', 'mobile'].map(point => `mcb-cols-${point}-${Math.min(6, Math.max(1, Number(columns?.[point]) || 3))}`).join(' ')
  const rows = cards.map(card => {
    const href = safeLinkHref(card.url)
    if (!href) return ''
    const image = safeAssetSrc(card.image), heading = title ? 'h3' : 'h2'
    const summary = card.access === 'PUBLIC' && block.props.showSummary === true ? String(card.summary || '').slice(0, 250) : ''
    return `<li><a class="mcb-item-card" href="${escapeHtml(href)}">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : '<span class="mcb-item-placeholder" aria-hidden="true"></span>'}<div class="mcb-item-copy"><${heading} dir="auto">${escapeHtml(card.title)}</${heading}>${card.subtitle ? `<p class="mcb-item-subtitle" dir="auto">${escapeHtml(card.subtitle)}</p>` : ''}${card.access !== 'PUBLIC' ? '<span class="mcb-item-access">ویژهٔ اعضا</span>' : ''}${summary ? `<p class="mcb-item-summary" dir="auto">${escapeHtml(summary)}</p>` : ''}</div></a></li>`
  }).join('')
  return `<section class="mcb mcb-module-grid" data-block="${escapeHtml(block.type)}" ${title ? `aria-labelledby="${escapeHtml(id)}"` : `aria-label="${escapeHtml(definition.label.fa)}"`}>${title ? `<h2 id="${escapeHtml(id)}" class="mcb-module-title" dir="auto">${escapeHtml(title)}</h2>` : ''}${rows ? `<ul class="mcb-module-items ${classes}">${rows}</ul>` : `<p class="mcb-module-empty">${error ? 'دریافت این بخش موقتاً انجام نشد؛ دوباره مراجعه کنید.' : 'هنوز موردی برای نمایش در این فهرست وجود ندارد.'}</p>`}</section>`
}
