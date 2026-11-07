import { parseBuilderDoc, type BuilderDoc } from './builder'

// AI proposes presentation only. Existing owner slots keep data/actions with their owners.
export const DESIGN_WIDGETS = ['heading', 'text', 'image', 'button', 'divider', 'spacer', 'hero', 'cta', 'icon-box', 'faq', 'tabs', 'testimonials', 'counters', 'pricing', 'steps', 'timeline', 'social', 'progress', 'alert', 'rating', 'post-header', 'post-cover', 'content', 'post-footer', 'product-hero', 'product-gallery', 'product-info', 'product-purchase', 'product-tabs', 'site-header', 'site-footer', 'surface-content', 'dashboard-part', 'dynamic-value'] as const

export function proposedDesign(value: unknown): BuilderDoc {
  const source = value as Record<string, unknown> | null
  if (!source || source.v !== 2 || source.mode !== 'builder' || !Array.isArray(source.sections) || !source.sections.length || source.sections.length > 8) throw new Error('پاسخ طراحی باید یک سند بصری با یک تا هشت بخش باشد')
  for (const section of source.sections as { columns?: { widgets?: { type?: unknown }[] }[] }[]) {
    if (!Array.isArray(section.columns)) throw new Error('ستون‌های پیشنهاد معتبر نیست')
    for (const column of section.columns) {
      if (!Array.isArray(column.widgets)) throw new Error('بلوک‌های پیشنهاد معتبر نیست')
      for (const widget of column.widgets) if (!(DESIGN_WIDGETS as readonly unknown[]).includes(widget.type)) throw new Error('بلوک پیشنهاد مجاز نیست')
    }
  }
  const doc = parseBuilderDoc(source)
  if (doc.code.html || doc.code.css || doc.code.js || doc.code.advanced) throw new Error('پیشنهاد هوش مصنوعی نمی‌تواند کد اجرایی داشته باشد')
  let count = 0
  for (const section of doc.sections) for (const column of section.columns) for (const widget of column.widgets) {
    if (!(DESIGN_WIDGETS as readonly string[]).includes(widget.type) || ++count > 48) throw new Error('بلوک یا اندازهٔ پیشنهاد طراحی مجاز نیست')
  }
  return doc
}

export function designResponse(text: string): BuilderDoc {
  if (text.length > 180000) throw new Error('پاسخ طراحی بیش از اندازه بزرگ است')
  const json = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return proposedDesign(JSON.parse(json))
}

export const designStillCurrent = (base: string, doc: BuilderDoc) => base === JSON.stringify(doc)
