'use client'

import { WIDGET_LABELS, type BuilderDoc, type BuilderWidget, type WidgetType } from '@/modules/site/domain/builder'
import type { Sel, WidgetRef } from './state'
import AiCodePanel from './AiCodePanel'

type L = (en: string, fa: string) => string

export type DragState =
  | { kind: 'widget'; ref: WidgetRef }
  | { kind: 'section'; sectionId: string }
  | { kind: 'palette'; type: WidgetType }
  | { kind: 'palette-section'; columns: number }
  | null

type Props = {
  doc: BuilderDoc
  sel: Sel | null
  L: L
  drag: DragState
  setDrag: (drag: DragState) => void
  onSelect: (sel: Sel) => void
  onDropWidget: (to: { sectionId: string; columnId: string; index?: number }) => void
  onDropSection: (toSectionId: string) => void
  onDropEmpty?: () => void
}

function summary(widget: BuilderWidget, L: L): string {
  const label = L(WIDGET_LABELS[widget.type].en, WIDGET_LABELS[widget.type].fa)
  const text = widget.props.title || widget.props.titleEn || widget.props.text || widget.props.label || widget.props.eyebrow || widget.props.html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return text ? `${label} — ${text.slice(0, 42)}` : label
}

export default function Canvas({ doc, sel, L, drag, setDrag, onSelect, onDropWidget, onDropSection, onDropEmpty }: Props) {
  if (!doc.sections.length && doc.mode !== 'code') {
    return <section className="builder-canvas">
      <div className="builder-canvas-head"><b>{L('Canvas', 'بوم')}</b></div>
      <div
        className="bld-empty"
        onDragOver={(event) => { if (drag?.kind === 'palette' || drag?.kind === 'palette-section') event.preventDefault() }}
        onDrop={(event) => { event.preventDefault(); if (drag?.kind === 'palette' || drag?.kind === 'palette-section') onDropEmpty?.() }}
      >
        <p>{L('Nothing here yet.', 'هنوز چیزی اینجا نیست.')}</p>
        <p className="muted text-sm">{L('Add a section from the left panel, drag a block in, or drop a prebuilt template.', 'از پنل سمت راست بخش اضافه کنید، یک بلوک را بکشید و رها کنید، یا یک قالب آماده درج کنید.')}</p>
      </div>
    </section>
  }
  return <section className="builder-canvas">
    <div className="builder-canvas-head">
      <b>{L('Canvas', 'بوم')} <small className="muted">({doc.sections.length} {L('sections', 'بخش')})</small></b>
      <span className="muted text-sm">{L('Drag blocks to reorder', 'برای جابه‌جایی بکشید و رها کنید')}</span>
    </div>
    <div className="bld-canvas-body">
      {doc.sections.map((section, sectionIndex) => {
        const selected = sel?.kind === 'section' && sel.sectionId === section.id
        return <div
          key={section.id}
          className={`bld-section ${selected ? 'is-selected' : ''} ${section.style.tone ? `tone-${section.style.tone}` : ''}`}
          style={section.style.bg ? { background: section.style.bg } : undefined}
          onClick={() => onSelect({ kind: 'section', sectionId: section.id })}
        >
          <div
            className="bld-section-bar"
            draggable
            onDragStart={() => setDrag({ kind: 'section', sectionId: section.id })}
            onDragEnd={() => setDrag(null)}
            onDragOver={(event) => { if (drag) event.preventDefault() }}
            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (drag?.kind === 'section' || drag?.kind === 'palette-section') onDropSection(section.id) }}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="mono">#{sectionIndex + 1}{section.anchor ? ` · #${section.anchor}` : ''}</span>
            <span className="muted">{L('drag', 'جابه‌جایی')} ⇅</span>
          </div>
          <div className="bld-cols-area">
            {section.columns.map((column) => <div
              key={column.id}
              className="bld-zone"
              style={{ flexBasis: `${column.width}%` }}
              onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'column', sectionId: section.id, columnId: column.id }) }}
              onDragOver={(event) => { if (drag && drag.kind !== 'section') event.preventDefault() }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (drag?.kind === 'widget' || drag?.kind === 'palette') onDropWidget({ sectionId: section.id, columnId: column.id }) }}
            >
              {column.widgets.map((widget, widgetIndex) => {
                const widgetSel = sel?.kind === 'widget' && sel.widgetId === widget.id
                return <div
                  key={widget.id}
                  className={`bld-widget ${widgetSel ? 'is-selected' : ''}`}
                  draggable
                  onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'widget', sectionId: section.id, columnId: column.id, widgetId: widget.id }) }}
                  onDragStart={() => setDrag({ kind: 'widget', ref: { sectionId: section.id, columnId: column.id, widgetId: widget.id } })}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(event) => { if (drag?.kind === 'widget' || drag?.kind === 'palette') event.preventDefault() }}
                  onDrop={(event) => {
                    event.preventDefault(); event.stopPropagation()
                    if (drag?.kind === 'widget' || drag?.kind === 'palette') onDropWidget({ sectionId: section.id, columnId: column.id, index: widgetIndex })
                  }}
                >
                  <b className={`bld-widget-kind k-${widget.type}`}>{L(WIDGET_LABELS[widget.type].en, WIDGET_LABELS[widget.type].fa)}</b>
                  <span className="muted">{summary(widget, L)}</span>
                </div>
              })}
              {!column.widgets.length && <span className="bld-zone-hint">{L('＋ drop a block', '＋ بلوک را اینجا بیندازید')}</span>}
            </div>)}
          </div>
        </div>
      })}
    </div>
  </section>
}

export function CodePane({ doc, L, onChange }: { doc: BuilderDoc; L: L; onChange: (next: BuilderDoc) => void }) {
  const advanced = doc.code.advanced
  const set = (key: 'html' | 'css' | 'js', value: string) => onChange({ ...doc, code: { ...doc.code, [key]: value } })
  return <section className="builder-canvas">
    <div className="builder-canvas-head">
      <b>{L('Code', 'کد')}</b>
      <label className="bld-switch">
        <input type="checkbox" checked={advanced} onChange={(event) => onChange({ ...doc, code: { ...doc.code, advanced: event.target.checked } })} />
        <span>{L('Advanced (allow JavaScript)', 'پیشرفته (اجازه جاوااسکریپت)')}</span>
      </label>
    </div>
    <div className="bld-code-body">
      <AiCodePanel target="page" L={L} current={{ html: doc.code.html, css: doc.code.css, js: doc.code.js }} onApply={(code) => onChange({ ...doc, code: { ...doc.code, ...code, advanced: code.js.trim() ? true : doc.code.advanced } })} />
      {advanced && <p className="bld-warning">{L('⚠ JavaScript runs for every visitor. Only paste code you trust; every save is audit-logged.', '⚠ جاوااسکریپت برای همه بازدیدکنندگان اجرا می‌شود. فقط کد مورد اعتماد را بگذارید؛ هر ذخیره در لاگ ممیزی ثبت می‌شود.')}</p>}
      <label className="bld-field"><span>HTML</span><textarea className="textarea bld-code mono" dir="ltr" rows={12} value={doc.code.html} placeholder="&lt;section class=&quot;hero&quot;&gt;…&lt;/section&gt;" onChange={(event) => set('html', event.target.value)} /></label>
      <label className="bld-field"><span>CSS</span><textarea className="textarea bld-code mono" dir="ltr" rows={8} value={doc.code.css} placeholder=".hero{padding:4rem 0}" onChange={(event) => set('css', event.target.value)} /></label>
      {advanced
        ? <label className="bld-field"><span>JavaScript</span><textarea className="textarea bld-code mono" dir="ltr" rows={6} value={doc.code.js} onChange={(event) => set('js', event.target.value)} /></label>
        : <label className="bld-field is-disabled"><span>JavaScript</span><textarea className="textarea bld-code mono" dir="ltr" rows={4} value="" readOnly placeholder={L('Enable advanced mode to use JavaScript.', 'برای استفاده از جاوااسکریپت حالت پیشرفته را روشن کنید.')} /></label>}
      <p className="muted text-sm">{L('Safe mode strips scripts and <style> blocks automatically; custom CSS lives in the CSS field.', 'حالت امن اسکریپت و بلوک‌های style را خودکار حذف می‌کند؛ CSS سفارشی در همین فیلد قرار می‌گیرد.')}</p>
    </div>
  </section>
}
