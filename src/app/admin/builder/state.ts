import {
  createSection, createWidget, cloneSections,
  type BuilderColumn, type BuilderDoc, type BuilderSection, type BuilderWidget, type WidgetStyle, type WidgetType,
} from '@/modules/site/domain/builder'

export type Sel =
  | { kind: 'section'; sectionId: string }
  | { kind: 'column'; sectionId: string; columnId: string }
  | { kind: 'widget'; sectionId: string; columnId: string; widgetId: string }

export type WidgetRef = { sectionId: string; columnId: string; widgetId: string }

export function getSection(doc: BuilderDoc, sectionId: string) {
  return doc.sections.find((section) => section.id === sectionId)
}

export function getWidget(doc: BuilderDoc, ref: WidgetRef): BuilderWidget | null {
  const section = getSection(doc, ref.sectionId)
  const column = section?.columns.find((col) => col.id === ref.columnId)
  return column?.widgets.find((widget) => widget.id === ref.widgetId) || null
}

function mapSections(doc: BuilderDoc, sectionId: string, fn: (section: BuilderSection) => BuilderSection): BuilderDoc {
  return { ...doc, sections: doc.sections.map((section) => (section.id === sectionId ? fn(section) : section)) }
}

function mapColumns(section: BuilderSection, columnId: string, fn: (column: BuilderColumn) => BuilderColumn): BuilderSection {
  return { ...section, columns: section.columns.map((column) => (column.id === columnId ? fn(column) : column)) }
}

export function patchSection(doc: BuilderDoc, sectionId: string, patch: Partial<BuilderSection>): BuilderDoc {
  return mapSections(doc, sectionId, (section) => ({ ...section, ...patch }))
}

export function patchSectionStyle(doc: BuilderDoc, sectionId: string, patch: Partial<BuilderSection['style']>): BuilderDoc {
  return mapSections(doc, sectionId, (section) => ({ ...section, style: { ...section.style, ...patch } }))
}

export function patchColumn(doc: BuilderDoc, sectionId: string, columnId: string, patch: Partial<BuilderColumn>): BuilderDoc {
  return mapSections(doc, sectionId, (section) => mapColumns(section, columnId, (column) => ({ ...column, ...patch })))
}

export function patchWidget(doc: BuilderDoc, ref: WidgetRef, patch: Partial<BuilderWidget>): BuilderDoc {
  return mapSections(doc, ref.sectionId, (section) =>
    mapColumns(section, ref.columnId, (column) => ({
      ...column,
      widgets: column.widgets.map((widget) => (widget.id === ref.widgetId ? { ...widget, ...patch } : widget)),
    })))
}

export function addSection(doc: BuilderDoc, columns: number): { doc: BuilderDoc; sel: Sel } {
  const section = createSection(columns)
  return { doc: { ...doc, sections: [...doc.sections, section] }, sel: { kind: 'section', sectionId: section.id } }
}

export function addColumn(doc: BuilderDoc, sectionId: string): BuilderDoc {
  return mapSections(doc, sectionId, (section) => {
    if (section.columns.length >= 4) return section
    const width = Math.round(100 / (section.columns.length + 1))
    const next = section.columns.map((column) => ({ ...column, width }))
    return { ...section, columns: [...next, { id: `c-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`, width, widgets: [] }] }
  })
}

export function removeColumn(doc: BuilderDoc, sectionId: string, columnId: string): BuilderDoc {
  return mapSections(doc, sectionId, (section) => {
    if (section.columns.length <= 1) return section
    const rest = section.columns.filter((column) => column.id !== columnId)
    const width = Math.round(100 / rest.length)
    return { ...section, columns: rest.map((column) => ({ ...column, width })) }
  })
}

export function addWidget(doc: BuilderDoc, sectionId: string, columnId: string, type: WidgetType, at?: number): { doc: BuilderDoc; sel: Sel } {
  const widget = createWidget(type)
  const next = mapSections(doc, sectionId, (section) =>
    mapColumns(section, columnId, (column) => {
      const widgets = [...column.widgets]
      widgets.splice(at === undefined ? widgets.length : at, 0, widget)
      return { ...column, widgets }
    }))
  return { doc: next, sel: { kind: 'widget', sectionId, columnId, widgetId: widget.id } }
}

export function removeWidget(doc: BuilderDoc, ref: WidgetRef): BuilderDoc {
  return mapSections(doc, ref.sectionId, (section) =>
    mapColumns(section, ref.columnId, (column) => ({ ...column, widgets: column.widgets.filter((widget) => widget.id !== ref.widgetId) })))
}

export function duplicateWidget(doc: BuilderDoc, ref: WidgetRef): { doc: BuilderDoc; sel: Sel } {
  const source = getWidget(doc, ref)
  if (!source) return { doc, sel: { kind: 'section', sectionId: ref.sectionId } }
  const copy: BuilderWidget = { ...source, id: `w-${Math.random().toString(36).slice(2, 11)}${Date.now().toString(36).slice(-4)}` }
  const next = mapSections(doc, ref.sectionId, (section) =>
    mapColumns(section, ref.columnId, (column) => {
      const index = column.widgets.findIndex((widget) => widget.id === ref.widgetId)
      const widgets = [...column.widgets]
      widgets.splice(index + 1, 0, copy)
      return { ...column, widgets }
    }))
  return { doc: next, sel: { kind: 'widget', sectionId: ref.sectionId, columnId: ref.columnId, widgetId: copy.id } }
}

export function duplicateSection(doc: BuilderDoc, sectionId: string): { doc: BuilderDoc; sel: Sel } {
  const index = doc.sections.findIndex((section) => section.id === sectionId)
  if (index < 0) return { doc, sel: { kind: 'section', sectionId } }
  const [copy] = cloneSections([doc.sections[index]])
  const sections = [...doc.sections]
  sections.splice(index + 1, 0, copy)
  return { doc: { ...doc, sections }, sel: { kind: 'section', sectionId: copy.id } }
}

export function removeSection(doc: BuilderDoc, sectionId: string): BuilderDoc {
  return { ...doc, sections: doc.sections.filter((section) => section.id !== sectionId) }
}

export function moveSection(doc: BuilderDoc, fromId: string, toId: string): BuilderDoc {
  const from = doc.sections.findIndex((section) => section.id === fromId)
  const to = doc.sections.findIndex((section) => section.id === toId)
  if (from < 0 || to < 0 || from === to) return doc
  const sections = [...doc.sections]
  const [moved] = sections.splice(from, 1)
  sections.splice(to, 0, moved)
  return { ...doc, sections }
}

/** Place a section exactly before or after another section (preview drag & drop). */
export function moveSectionTo(doc: BuilderDoc, fromId: string, toId: string, after: boolean): BuilderDoc {
  const from = doc.sections.findIndex((section) => section.id === fromId)
  if (from < 0 || fromId === toId) return doc
  const sections = [...doc.sections]
  const [moved] = sections.splice(from, 1)
  let dest = sections.findIndex((section) => section.id === toId)
  if (dest < 0) return doc
  if (after) dest += 1
  sections.splice(dest, 0, moved)
  return { ...doc, sections }
}

/** Insert a brand-new section next to another one (live-preview palette drop). `toId` null appends. */
export function insertSectionNear(doc: BuilderDoc, columns: number, toId: string | null, after: boolean): { doc: BuilderDoc; sel: Sel } {
  if (!toId) return insertSectionAt(doc, columns, null)
  const index = doc.sections.findIndex((section) => section.id === toId)
  if (index < 0) return insertSectionAt(doc, columns, null)
  const next = doc.sections[index + (after ? 1 : 0)]
  return insertSectionAt(doc, columns, next ? next.id : null)
}

/** Move a section one step up or down. */
export function nudgeSection(doc: BuilderDoc, sectionId: string, delta: -1 | 1): BuilderDoc {
  const from = doc.sections.findIndex((section) => section.id === sectionId)
  const to = from + delta
  if (from < 0 || to < 0 || to >= doc.sections.length) return doc
  const sections = [...doc.sections]
  const [moved] = sections.splice(from, 1)
  sections.splice(to, 0, moved)
  return { ...doc, sections }
}

/** Move a block one step up or down inside its column. */
export function nudgeWidget(doc: BuilderDoc, ref: WidgetRef, delta: -1 | 1): BuilderDoc {
  return mapSections(doc, ref.sectionId, (section) =>
    mapColumns(section, ref.columnId, (column) => {
      const from = column.widgets.findIndex((widget) => widget.id === ref.widgetId)
      const to = from + delta
      if (from < 0 || to < 0 || to >= column.widgets.length) return column
      const widgets = [...column.widgets]
      const [moved] = widgets.splice(from, 1)
      widgets.splice(to, 0, moved)
      return { ...column, widgets }
    }))
}

/** Find where a block lives (ids are unique inside a document). */
export function locateWidget(doc: BuilderDoc, widgetId: string): WidgetRef | null {
  for (const section of doc.sections) {
    for (const column of section.columns) {
      if (column.widgets.some((widget) => widget.id === widgetId)) return { sectionId: section.id, columnId: column.id, widgetId }
    }
  }
  return null
}

/** Spread the columns of a section evenly. */
export function equalizeColumns(doc: BuilderDoc, sectionId: string): BuilderDoc {
  return mapSections(doc, sectionId, (section) => {
    const width = Math.round(100 / section.columns.length)
    return { ...section, columns: section.columns.map((column) => ({ ...column, width })) }
  })
}

/** Insert a brand-new section before another one (palette drag), or append when `beforeId` is null. */
export function insertSectionAt(doc: BuilderDoc, columns: number, beforeId: string | null): { doc: BuilderDoc; sel: Sel } {
  const section = createSection(columns)
  const sections = [...doc.sections]
  let at = beforeId ? sections.findIndex((item) => item.id === beforeId) : sections.length
  if (at < 0) at = sections.length
  sections.splice(at, 0, section)
  return { doc: { ...doc, sections }, sel: { kind: 'section', sectionId: section.id } }
}

export function moveWidget(doc: BuilderDoc, from: WidgetRef, to: { sectionId: string; columnId: string; index?: number }): { doc: BuilderDoc; sel: Sel } {
  const source = getWidget(doc, from)
  if (!source) return { doc, sel: { kind: 'section', sectionId: from.sectionId } }
  const targetColumn = getSection(doc, to.sectionId)?.columns.find((column) => column.id === to.columnId)
  if (!targetColumn) return { doc, sel: { kind: 'widget', ...from } }
  const sameColumn = from.sectionId === to.sectionId && from.columnId === to.columnId
  let index = to.index
  if (index === undefined) index = sameColumn ? targetColumn.widgets.findIndex((widget) => widget.id === from.widgetId) : targetColumn.widgets.length
  const stripped = removeWidget(doc, from)
  const next = mapSections(stripped, to.sectionId, (section) =>
    mapColumns(section, to.columnId, (column) => {
      const widgets = [...column.widgets]
      widgets.splice(Math.max(0, Math.min(widgets.length, index)), 0, source)
      return { ...column, widgets }
    }))
  return { doc: next, sel: { kind: 'widget', sectionId: to.sectionId, columnId: to.columnId, widgetId: source.id } }
}

export function insertSections(doc: BuilderDoc, sections: BuilderSection[]): { doc: BuilderDoc; sel: Sel } {
  const cloned = cloneSections(sections)
  const last = cloned[cloned.length - 1]
  return {
    doc: { ...doc, sections: [...doc.sections, ...cloned] },
    sel: last ? { kind: 'section', sectionId: last.id } : { kind: 'section', sectionId: doc.sections[0]?.id || '' },
  }
}

/** Sets (or, with nothing left set, removes) the advanced style of a block or a section. */
export function patchAdvanced(doc: BuilderDoc, target: { sectionId: string; columnId?: string; widgetId?: string }, adv: BuilderWidget['adv']): BuilderDoc {
  const strip = <T extends { adv?: BuilderWidget['adv'] }>(element: T): T => { const { adv: _old, ...rest } = element; return (adv ? { ...rest, adv } : rest) as T }
  if (target.widgetId && target.columnId) return mapSections(doc, target.sectionId, (section) => mapColumns(section, target.columnId!, (column) => ({ ...column, widgets: column.widgets.map((widget) => (widget.id === target.widgetId ? strip(widget) : widget)) })))
  return mapSections(doc, target.sectionId, (section) => strip(section))
}

export function applyWidgetStyle(doc: BuilderDoc, ref: WidgetRef, patch: Partial<WidgetStyle>): BuilderDoc {
  const widget = getWidget(doc, ref)
  if (!widget) return doc
  return patchWidget(doc, ref, { style: { ...widget.style, ...patch } })
}

export function widgetTitle(doc: BuilderDoc, ref: WidgetRef): string {
  const widget = getWidget(doc, ref)
  if (!widget) return ''
  const props = widget.props
  return props.title || props.text || props.label || props.eyebrow || props.html?.replace(/<[^>]+>/g, '').trim().slice(0, 40) || ''
}
