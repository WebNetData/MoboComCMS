import {
  createSection, createWidget, validateBuilderDoc,
  type BuilderColumn, type BuilderDoc, type BuilderSection, type BuilderWidget, type WidgetType, type WidgetStyle,
} from './builder'
import type { AdvancedStyle } from './builder-style'

// The pieces bundled templates are written with: a block, a column, a section and a whole document,
// each passing through the document's own validation, and `fx` to give an element advanced style.

export function w(type: WidgetType, props: Record<string, string>, style: Partial<WidgetStyle> = {}): BuilderWidget {
  const base = createWidget(type)
  return { ...base, props: { ...base.props, ...props }, style: { ...base.style, ...style } }
}

export function col(widgets: BuilderWidget[], width = 100): BuilderColumn {
  return { id: `c-${Math.random().toString(36).slice(2, 10)}`, width, widgets }
}

export function sec(columns: BuilderColumn[], opts: Partial<BuilderSection['style']> = {}): BuilderSection {
  const base = createSection(1)
  return { ...base, columns, style: { ...base.style, paddingY: 72, ...opts } }
}

/** `postStyle`: on an article template, the magazine page style its header and reading column wear. */
export function doc(sections: BuilderSection[], postStyle = ''): BuilderDoc {
  return validateBuilderDoc({ v: 2, mode: 'builder', code: { html: '', css: '', js: '', advanced: false }, sections, layout: { header: 'default', footer: 'default', postStyle } })
}

/** A block or a section with advanced style (effects, surfaces, motion); the document's validation keeps only what is allowed. */
export function fx<T extends BuilderWidget | BuilderSection>(element: T, adv: AdvancedStyle): T {
  return { ...element, adv }
}

export const center: Partial<WidgetStyle> = { align: 'center' }

export const items = (rows: Record<string, string>[]) => JSON.stringify(rows)
