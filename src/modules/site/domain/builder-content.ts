import type { BuilderDoc, BuilderWidget } from './builder'
import { plainText } from '@/shared/text/plain'

const WIDGET_MODULE: Partial<Record<string, string>> = { plans: 'vpn', network: 'vpn', posts: 'journal', products: 'store', 'vip-cta': 'membership' }
export const builderMediaModule = (source: string) => source.startsWith('cinema-') ? 'cinema' : source.startsWith('games-') ? 'games' : 'music'
export const builderWidgetModule = (widget: BuilderWidget) => widget.type === 'media' ? builderMediaModule(widget.props.source || '') : WIDGET_MODULE[widget.type]

const TEXT_FIELDS: Partial<Record<BuilderWidget['type'], string[]>> = {
  heading: ['text'], hero: ['eyebrow', 'title', 'text'], cta: ['title', 'text'], 'icon-box': ['title', 'text'],
  list: ['title'], faq: ['title'], testimonials: ['title'], pricing: ['title'], countdown: ['title', 'text'],
  posts: ['title'], products: ['title'], media: ['title'], 'vip-cta': ['title', 'text'],
}
const ITEM_FIELDS: Partial<Record<BuilderWidget['type'], string[]>> = {
  list: ['title', 'text'], faq: ['q', 'a'], tabs: ['title', 'text'], testimonials: ['quote', 'name', 'role'],
  stats: ['value', 'label'], counters: ['value', 'label'], progress: ['label'], carousel: ['title'],
}

/** Authored words shown by the saved design. Never inspect URLs, scripts, CSS, form answers or feed configuration. */
export function builderContentText(doc: BuilderDoc, locale: 'fa' | 'en', templates: ReadonlyMap<string, BuilderDoc> = new Map(), modules: Record<string, boolean> = {}): string {
  const parts: string[] = []
  let characters = 0, visited = 0
  const add = (value: unknown) => {
    if (characters >= 2000 || typeof value !== 'string') return
    const text = plainText(value, 2000 - characters)
    if (text) { parts.push(text); characters += text.length }
  }
  const pick = (row: Record<string, unknown>, key: string) => locale === 'fa' ? row[key] || row[key+'En'] : row[key+'En'] || row[key]
  const visit = (current: BuilderDoc, depth: number) => {
    if (depth === 0 && current.mode === 'code') { add(current.code.html); return }
    for (const section of current.sections) for (const column of section.columns) for (const widget of column.widgets) {
      if (++visited > 1000 || characters >= 2000) return
      const owner = builderWidgetModule(widget), props = widget.props
      if (owner && modules[owner] === false) continue
      if (widget.type === 'template') {
        const nested = templates.get(props.templateId || '')
        if (nested && depth < 3) visit(nested, depth + 1)
        continue
      }
      if (widget.type === 'text') add(locale === 'fa' ? props.html : props.htmlEn || props.html)
      else if (widget.type === 'html') add(props.html)
      else for (const key of TEXT_FIELDS[widget.type] || []) add(pick(props, key))
      if (ITEM_FIELDS[widget.type] && props.items) {
        try {
          const rows: unknown = JSON.parse(props.items)
          if (Array.isArray(rows)) for (const row of rows.slice(0, 100)) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) continue
            for (const key of ITEM_FIELDS[widget.type]!) add(pick(row, key))
          }
        } catch { /* An invalid optional list has no public words. */ }
      }
    }
  }
  visit(doc, 0)
  return parts.join(' ')
}
