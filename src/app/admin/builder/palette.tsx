'use client'

import { useState } from 'react'
import { WIDGET_LABELS, type BuilderDoc, type WidgetType, POST_SLOT_TYPES, PRODUCT_SLOT_TYPES } from '@/modules/site/domain/builder'
import type { Sel } from './state'
import type { DragState } from './canvas'

type L = (en: string, fa: string) => string

const GROUPS: { titleEn: string; titleFa: string; types: WidgetType[] }[] = [
  { titleEn: 'Content', titleFa: 'محتوا', types: ['heading', 'text', 'image', 'button', 'video', 'nav'] },
  { titleEn: 'Structure', titleFa: 'ساختار', types: ['divider', 'spacer', 'stats', 'list', 'faq'] },
  { titleEn: 'Showcase', titleFa: 'نمایشی', types: ['icon-box', 'tabs', 'testimonials', 'counters', 'progress', 'pricing', 'countdown'] },
  { titleEn: 'Advanced', titleFa: 'پیشرفته', types: ['accordion', 'flip-box', 'animated-headline', 'before-after', 'timeline', 'team', 'logos', 'marquee', 'steps', 'comparison', 'video-box', 'alert', 'rating'] },
  { titleEn: 'Media & social', titleFa: 'رسانه و شبکه‌ها', types: ['slides', 'gallery', 'carousel', 'social'] },
  { titleEn: 'Sections', titleFa: 'بخش‌های آماده', types: ['hero', 'cta', 'plans', 'posts', 'products', 'media', 'vip-cta', 'network', 'form'] },
  { titleEn: 'Code & templates', titleFa: 'کد و قالب', types: ['html', 'template'] },
]

const POST_GROUP = { titleEn: 'Article parts', titleFa: 'اجزای مقاله', types: [...POST_SLOT_TYPES] as WidgetType[] }
const PRODUCT_GROUP = { titleEn: 'Product parts', titleFa: 'اجزای محصول', types: [...PRODUCT_SLOT_TYPES] as WidgetType[] }
const CHROME_GROUP = { titleEn: 'Site header & footer', titleFa: 'هدر و فوتر سایت', types: ['site-header', 'site-footer', 'nav'] as WidgetType[] }

const GLYPH: Partial<Record<WidgetType, string>> = {
  heading: 'H', text: '¶', image: '🖼', button: '➔', video: '▶', nav: '☰', divider: '—', spacer: '↕', stats: '#', list: '▦', faq: '?',
  hero: '★', cta: '📣', plans: '💳', posts: '📰', products: '🛒', network: '🌐', form: '✉', html: '</>', template: '⧉',
  'post-header': 'T', 'post-cover': '▭', content: '≡', 'post-footer': '⌄',
  'product-hero': '◈', 'product-gallery': '▤', 'product-info': 'ℹ', 'product-purchase': '🛍', 'product-usp': '✓', 'product-tabs': '⊟',
  'site-header': '▔', 'site-footer': '▁',
  media: '🎬', 'vip-cta': '♛',
  'icon-box': '◆', tabs: '⊟', testimonials: '❝', counters: '①', gallery: '▦', carousel: '⇆', slides: '▶', accordion: '☰', 'flip-box': '⟲', 'animated-headline': '✎', 'before-after': '◧', timeline: '┊', team: '☺', logos: '◎', marquee: '⇢', steps: '①', comparison: '▤', 'video-box': '▷', alert: '!', rating: '★', pricing: '₪', countdown: '⏱', social: '@', progress: '▰',
}

/** Extra block groups offered for the page being edited. */
function groupsFor(pageId = '') {
  if (pageId.startsWith('post-') || pageId.startsWith('tpl-post-')) return [POST_GROUP, ...GROUPS]
  if (pageId.startsWith('product-') || pageId.startsWith('tpl-product-')) return [PRODUCT_GROUP, ...GROUPS]
  if (pageId.startsWith('tpl-header-') || pageId.startsWith('tpl-footer-')) return [CHROME_GROUP, ...GROUPS]
  return GROUPS
}

type Props = {
  doc: BuilderDoc
  sel: Sel | null
  L: L
  drag: DragState
  setDrag: (drag: DragState) => void
  pageId?: string
  onSelect: (sel: Sel) => void
  onAddSection: (columns: number) => void
  onAddWidget: (type: WidgetType) => void
  onDropWidget: (to: { sectionId: string; columnId: string; index?: number }) => void
  onDropSection: (toSectionId: string) => void
}

/** A few words of what a block shows, for the structure panel. */
function snippet(widget: BuilderDoc['sections'][number]['columns'][number]['widgets'][number]) {
  const props = widget.props || {}
  let raw = props.title || props.text || props.label || ''
  if (!raw && props.html) raw = props.html
  if (!raw && props.items) { try { const first = JSON.parse(props.items)[0]; raw = first?.title || first?.label || first?.q || '' } catch { raw = '' } }
  const text = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 26 ? `${text.slice(0, 26)}…` : text
}

export default function Palette({ doc, sel, L, drag, setDrag, pageId, onSelect, onAddSection, onAddWidget, onDropWidget, onDropSection }: Props) {
  const groups = groupsFor(pageId)
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  return <aside className="builder-panel">
    <h2>{L('Add a block', 'افزودن بلوک')}</h2>
    <div className="bld-sect-add">
      {[1, 2, 3, 4].map((count) => <button
        key={count}
        type="button"
        className="btn btn-ghost btn-sm"
        draggable
        onDragStart={(event) => { try { event.dataTransfer.setData('text/plain', `section:${count}`); event.dataTransfer.effectAllowed = 'copy' } catch { /* ignore */ } setDrag({ kind: 'palette-section', columns: count }) }}
        onDragEnd={() => setDrag(null)}
        onClick={() => onAddSection(count)}
      >
        {count === 1 ? L('Section', 'بخش') : L(`${count}-col section`, `بخش ${count} ستونه`)}
      </button>)}
    </div>
    {groups.map((group) => <div className="bld-group" key={group.titleEn}>
      <h3>{L(group.titleEn, group.titleFa)}</h3>
      <div className="builder-palette">
        {group.types.map((type) => <button data-vip={type === 'vip-cta' ? '' : undefined}
          key={type}
          type="button"
          draggable
          onDragStart={(event) => { try { event.dataTransfer.setData('text/plain', `block:${type}`); event.dataTransfer.effectAllowed = 'copy' } catch { /* ignore */ } setDrag({ kind: 'palette', type })}}
          onDragEnd={() => setDrag(null)}
          onClick={() => onAddWidget(type)}
        >
          <span aria-hidden="true">{GLYPH[type] || '＋'}</span>
          {L(WIDGET_LABELS[type].en, WIDGET_LABELS[type].fa)}
        </button>)}
      </div>
    </div>)}

    <h2>{L('Structure', 'ساختار صفحه')}</h2>
    <div className="bld-tree">
      {doc.sections.map((section, sectionIndex) => {
        const sectionSel = sel?.kind === 'section' && sel.sectionId === section.id
        return <div className="bld-tree-section" key={section.id}>
          <div
            className={`bld-tree-row ${sectionSel ? 'is-selected' : ''}`}
            draggable
            onDragStart={() => setDrag({ kind: 'section', sectionId: section.id })}
            onDragEnd={() => setDrag(null)}
            onDragOver={(event) => { if (drag) event.preventDefault() }}
            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (drag?.kind === 'section' || drag?.kind === 'palette-section') onDropSection(section.id) }}
          >
            <button type="button" className="bld-tree-fold" aria-expanded={!folded[section.id]} aria-label={folded[section.id] ? L('Show what is inside', 'نمایش محتوا') : L('Fold', 'جمع کردن')} onClick={() => setFolded((now) => ({ ...now, [section.id]: !now[section.id] }))}>{folded[section.id] ? '▸' : '▾'}</button>
            <button type="button" onClick={() => onSelect({ kind: 'section', sectionId: section.id })}>
              <small>{sectionIndex + 1}</small>
              <span>{section.anchor ? `#${section.anchor}` : L('Section', 'بخش')} · {section.columns.length}{L(' col', ' ستون')}{section.adv && <em className="bld-tree-fx" title={L('Has advanced style', 'استایل پیشرفته دارد')}>✦</em>}</span>
            </button>
          </div>
          {!folded[section.id] && section.columns.map((column, columnIndex) => <div className="bld-tree-col" key={column.id}>
            <div className={`bld-tree-row is-col ${sel?.kind === 'column' && sel.columnId === column.id ? 'is-selected' : ''}`}>
              <button type="button" onClick={() => onSelect({ kind: 'column', sectionId: section.id, columnId: column.id })}>
                <small>{sectionIndex + 1}.{columnIndex + 1}</small>
                <span>{L('Column', 'ستون')} {column.width}%</span>
              </button>
            </div>
            {column.widgets.map((widget, widgetIndex) => <div
              className={`bld-tree-row is-widget ${sel?.kind === 'widget' && sel.widgetId === widget.id ? 'is-selected' : ''}`}
              key={widget.id}
              draggable
              onDragStart={() => setDrag({ kind: 'widget', ref: { sectionId: section.id, columnId: column.id, widgetId: widget.id } })}
              onDragEnd={() => setDrag(null)}
              onDragOver={(event) => { if (drag?.kind === 'widget' || drag?.kind === 'palette') event.preventDefault() }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (drag?.kind === 'widget' || drag?.kind === 'palette') onDropWidget({ sectionId: section.id, columnId: column.id, index: widgetIndex }) }}
            >
              <button type="button" onClick={() => onSelect({ kind: 'widget', sectionId: section.id, columnId: column.id, widgetId: widget.id })}>
                <small>·</small>
                <span>{L(WIDGET_LABELS[widget.type].en, WIDGET_LABELS[widget.type].fa)}{snippet(widget) && <i className="bld-tree-snip">{snippet(widget)}</i>}{widget.adv && <em className="bld-tree-fx" title={L('Has advanced style', 'استایل پیشرفته دارد')}>✦</em>}</span>
              </button>
            </div>)}
            {!column.widgets.length && <div
              className="bld-tree-row is-empty"
              onDragOver={(event) => { if (drag?.kind === 'widget' || drag?.kind === 'palette') event.preventDefault() }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (drag?.kind === 'widget' || drag?.kind === 'palette') onDropWidget({ sectionId: section.id, columnId: column.id, index: 0 }) }}
            ><span>{L('empty — drop a block here', 'خالی — بلوک را اینجا رها کنید')}</span></div>}
          </div>)}
        </div>
      })}
      {!doc.sections.length && <p className="muted text-sm">{L('No sections yet — add one above.', 'هنوز بخشی نیست — از بالا اضافه کنید.')}</p>}
    </div>
  </aside>
}
