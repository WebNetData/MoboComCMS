'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { WIDGET_TYPES, cloneSections, emptyDoc, type BuilderDoc, type WidgetType } from '@/modules/site/domain/builder'
import {
  addSection as addSectionOp, addWidget, duplicateSection, duplicateWidget,
  insertSectionAt, insertSectionNear, insertSections, locateWidget, moveSection, moveSectionTo, moveWidget,
  removeColumn, removeSection, removeWidget,
  type Sel,
} from './state'
import Palette from './palette'
import Canvas, { CodePane, type DragState } from './canvas'
import Inspector from './inspector'
import TemplatesPanel from './templates-panel'
import KitPanel from './kit-panel'
import LivePreviewFrame from './LivePreviewFrame'
import AiDesignPanel from './AiDesignPanel'
import { useBuilderLivePreview } from './use-live-preview'
import './studio.css'
import { ensureTemplateForms } from './template-forms'

type Meta = { title: string; titleEn: string; path: string; status?: string }

const HISTORY_LIMIT = 80
/** Typing into one field within this window is one undo step. */
const COALESCE_MS = 1200

type Device = 'desktop' | 'tablet' | 'mobile'


const previewUrl = (pageId: string, version: number | string) => `/builder-preview/${encodeURIComponent(pageId)}?v=${version}`

const selKey = (sel: Sel | null | undefined) => (!sel ? '' : sel.kind === 'widget' ? `w:${sel.widgetId}` : sel.kind === 'column' ? `c:${sel.columnId}` : `s:${sel.sectionId}`)

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

function backTarget(pageId: string): { href: string; label: [string, string] } {
  if (pageId.startsWith('tpl-')) return { href: '/admin/theme-builder', label: ['Theme builder', 'سازندهٔ قالب'] }
  if (pageId === 'home') return { href: '/admin/studio', label: ['Studio', 'استودیو'] }
  if (pageId === 'blog') return { href: '/admin/site-management', label: ['Site management', 'مدیریت سایت'] }
  if (pageId.startsWith('post-')) return { href: '/admin/posts', label: ['Posts', 'مطالب'] }
  if (pageId.startsWith('product-')) return { href: '/admin/products', label: ['Products', 'محصولات'] }
  if (/^\d+$/.test(pageId)) return { href: '/admin/pages', label: ['Pages', 'صفحه‌ها'] }
  return { href: '/admin', label: ['Dashboard', 'داشبورد'] }
}

type LayoutOption = { id: string; fa: string; en: string; group: 'style' | 'mystyle' | 'theme' | 'builtin' | 'mine'; status?: 'draft' | 'published' }
type PostTemplateState = { templateId: string; options: LayoutOption[] }
type ChromeTemplate = { id: string; type: string; name: string; nameEn: string; status: string }

export default function BuilderEditor({ pageId }: { pageId: string }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = useCallback((en: string, persian: string) => (fa ? persian : en), [fa])

  const [doc, setDoc] = useState<BuilderDoc | null>(null)
  const docRef = useRef<BuilderDoc | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [saved, setSaved] = useState('')
  const [past, setPast] = useState<BuilderDoc[]>([])
  const [future, setFuture] = useState<BuilderDoc[]>([])
  const [sel, setSel] = useState<Sel | null>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showKit, setShowKit] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [revision, setRevision] = useState<string | undefined>()
  const [view, setView] = useState<'live' | 'structure'>('live')
  const [panels, setPanels] = useState({ left: true, right: true })
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const collapse = () => { if (query.matches) setPanels({ left: false, right: false }) }
    collapse(); query.addEventListener('change', collapse)
    return () => query.removeEventListener('change', collapse)
  }, [])
  const [previewSrc, setPreviewSrc] = useState(() => previewUrl(pageId, 0))
  const [device, setDevice] = useState<Device>('desktop')
  const draftPushed = useRef(false)
  const lastEdit = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  const [postTpl, setPostTpl] = useState<PostTemplateState | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previewReady = useRef(false), refreshPending = useRef(true)
  const selRef = useRef<Sel | null>(null)
  useEffect(() => { selRef.current = sel }, [sel])

  // Posts and products can pick their layout (single template) — WordPress style.
  const entry = /^(post|product)-(\d+)$/.exec(pageId)
  const entity = entry ? (entry[1] as 'post' | 'product') : null
  const entryId = entry ? Number(entry[2]) : 0
  const isPost = entity === 'post'
  const postId = isPost ? entryId : 0
  const templateKind = /^tpl-(header|footer|page|post|product|surface)-/.exec(pageId)?.[1] || null
  const [chromeTemplates, setChromeTemplates] = useState<ChromeTemplate[]>([])

  const refreshPreview = useCallback(() => {
    const frame = iframeRef.current
    refreshPending.current = true
    if (frame?.contentWindow && frame.getAttribute('src')?.startsWith('/builder-preview/' + encodeURIComponent(pageId))) {
      if (previewReady.current) { frame.contentWindow.postMessage({ source: 'happ-builder-editor', type: 'refresh', pageId }, window.location.origin); refreshPending.current = false }
    } else { previewReady.current = false; setPreviewSrc(previewUrl(pageId, Date.now())) }
  }, [pageId])
  useEffect(() => { previewReady.current = false; refreshPending.current = true }, [pageId, view, doc?.mode, previewSrc])

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/admin/page-builder?pageId=${encodeURIComponent(pageId)}`, { cache: 'no-store' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) {
      const stored: BuilderDoc = data.doc || emptyDoc()
      const draftDoc: BuilderDoc | null = data.draft?.doc || null
      const restored = !!draftDoc && JSON.stringify(draftDoc) !== JSON.stringify(stored)
      const next = restored && draftDoc ? draftDoc : stored
      draftPushed.current = !!data.draft
      docRef.current = next
      setDoc(next); setMeta(data.meta); setRevision(data.revision); setSaved(JSON.stringify(stored)); setPast([]); setFuture([])
      setSel(next.sections[0] ? { kind: 'section', sectionId: next.sections[0].id } : null)
      setMessage(restored ? L('Unsaved draft restored.', 'پیش‌نویس ذخیره‌نشده بازیابی شد.') : '')
      refreshPreview()
      // Opened from «＋ صفحه با صفحه‌ساز» with a whole-page template: an empty page starts from it (once; the address is cleaned).
      const asked = new URLSearchParams(window.location.search).get('template')
      if (asked && !next.sections.length) {
        const url = new URL(window.location.href); url.searchParams.delete('template'); window.history.replaceState(null, '', url)
        const listed = await fetch(`/api/admin/builder/templates?pageId=${encodeURIComponent(pageId)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        const template = (listed?.pageBundled || []).find((entry: { id: string }) => entry.id === asked) as { doc: BuilderDoc; fa: string } | undefined
        if (template) {
          const started = { ...next, sections: cloneSections(template.doc.sections) }
          docRef.current = started; setDoc(started); setSel(started.sections[0] ? { kind: 'section', sectionId: started.sections[0].id } : null)
          const made = await ensureTemplateForms(template.doc)
          setMessage(L('Started from a template; save to keep it.', `صفحه از قالب «${template.fa}» ساخته شد؛ برای ماندگاری ذخیره کنید.`) + (made ? ` ${made}` : ''))
        }
      }
    } else {
      setMessage(data?.error || L('Unable to open the builder.', 'باز کردن صفحه‌ساز ممکن نشد.'))
    }
    setLoading(false)
  }, [pageId, L, refreshPreview])
  useEffect(() => { void load() }, [load])

  const dirty = useMemo(() => !!doc && JSON.stringify(doc) !== saved, [doc, saved])

  /**
   * `history = true` records an undo step; `false` is used for continuous edits
   * (typing, sliders) and groups them per field into a single step.
   */
  const onChange = useCallback((next: BuilderDoc, newSel?: Sel | null, history = true) => {
    const previous = docRef.current
    if (previous && next !== previous) {
      const now = Date.now()
      const key = selKey(newSel === undefined ? selRef.current : newSel)
      const record = history || lastEdit.current.key !== key || now - lastEdit.current.at > COALESCE_MS
      lastEdit.current = history ? { key: '', at: 0 } : { key, at: now }
      if (record) {
        setPast((stack) => [...stack.slice(-(HISTORY_LIMIT - 1)), previous])
        setFuture([])
      }
    }
    docRef.current = next
    setDoc(next)
    if (newSel !== undefined) setSel(newSel)
  }, [])

  const undo = useCallback(() => {
    const previous = past[past.length - 1]
    if (!previous || !docRef.current) return
    const current = docRef.current
    setPast((stack) => stack.slice(0, -1))
    setFuture((stack) => [...stack, current])
    docRef.current = previous
    lastEdit.current = { key: '', at: 0 }
    setDoc(previous)
    setSel(null)
  }, [past])

  const redo = useCallback(() => {
    const next = future[future.length - 1]
    if (!next || !docRef.current) return
    const current = docRef.current
    setFuture((stack) => stack.slice(0, -1))
    setPast((stack) => [...stack, current])
    docRef.current = next
    lastEdit.current = { key: '', at: 0 }
    setDoc(next)
    setSel(null)
  }, [future])

  const save = useCallback(async () => {
    if (!doc || busy || uploading) return
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/page-builder', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, doc, expectedRevision: revision }),
    }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) { const stored: BuilderDoc = data.doc || doc; setRevision(data.revision); if (docRef.current === doc) { docRef.current = stored; setDoc(stored) } draftPushed.current = false; setSaved(JSON.stringify(stored)); setMessage(L('Saved.', 'ذخیره شد.')); refreshPreview() }
    else setMessage(data?.error || L('Save failed.', 'ذخیره انجام نشد.'))
    setBusy(false)
  }, [doc, pageId, busy, uploading, L, refreshPreview, revision])

  const live = useBuilderLivePreview({ doc, saved, loading, pageId, draftPushed, refresh: refreshPreview })

  const sendSelection = useCallback(() => {
    const current = selRef.current
    const target = iframeRef.current?.contentWindow
    if (!target) return
    target.postMessage({
      source: 'happ-builder-editor',
      type: 'select',
      sectionId: current?.sectionId || null,
      columnId: current && current.kind !== 'section' ? current.columnId : null,
      widgetId: current?.kind === 'widget' ? current.widgetId : null,
    }, window.location.origin)
  }, [])

  // Clicks inside the preview iframe select elements in the editor; drops move or insert blocks.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return
      const data = event.data as {
        pageId?: string; source?: string; type?: string; sectionId?: string | null; columnId?: string | null; widgetId?: string | null
        fromId?: string | null; toId?: string | null; after?: number | boolean; index?: number
        widgetType?: string; columns?: number; key?: string; shift?: boolean
      } | null
      if (!data || data.source !== 'happ-builder-preview' || data.pageId !== pageId) return
      if (data.type === 'ready') { previewReady.current = true; if (refreshPending.current) refreshPreview(); sendSelection(); return }
      if (data.type === 'key') {
        if (data.key === 's') void saveRef.current()
        else if (data.key === 'z' && !data.shift) undoRef.current()
        else if (data.key === 'y' || (data.key === 'z' && data.shift)) redoRef.current()
        return
      }
      const current = docRef.current
      if (!current) return
      const index = typeof data.index === 'number' && Number.isFinite(data.index) ? data.index : undefined
      if (data.type === 'move-widget') {
        const { widgetId, sectionId, columnId } = data
        if (!widgetId || !sectionId || !columnId) return
        const source = locateWidget(current, widgetId)
        if (!source) return
        const result = moveWidget(current, source, { sectionId, columnId, index })
        onChange(result.doc, result.sel)
        return
      }
      if (data.type === 'insert-widget') {
        const type = WIDGET_TYPES.find((entry) => entry === data.widgetType)
        if (!type) return
        if (data.sectionId && data.columnId && current.sections.some((section) => section.id === data.sectionId)) {
          const result = addWidget(current, data.sectionId, data.columnId, type, index)
          onChange(result.doc, result.sel)
        } else {
          const created = addSectionOp(current, 1)
          const section = created.doc.sections[created.doc.sections.length - 1]
          const result = addWidget(created.doc, section.id, section.columns[0].id, type)
          onChange(result.doc, result.sel)
        }
        return
      }
      if (data.type === 'insert-section') {
        const columns = Math.min(4, Math.max(1, Number(data.columns) || 1))
        const result = insertSectionNear(current, columns, typeof data.toId === 'string' ? data.toId : null, !!data.after)
        onChange(result.doc, result.sel)
        return
      }
      if (data.type === 'move-section') {
        if (typeof data.fromId !== 'string' || typeof data.toId !== 'string') return
        onChange(moveSectionTo(current, data.fromId, data.toId, !!data.after), undefined, true)
        return
      }
      if (data.type !== 'select') return
      const sectionId = typeof data.sectionId === 'string' && data.sectionId ? data.sectionId : null
      const columnId = typeof data.columnId === 'string' && data.columnId ? data.columnId : null
      const widgetId = typeof data.widgetId === 'string' && data.widgetId ? data.widgetId : null
      if (widgetId && sectionId && columnId) setSel({ kind: 'widget', sectionId, columnId, widgetId })
      else if (sectionId && columnId) setSel({ kind: 'column', sectionId, columnId })
      else if (sectionId) setSel({ kind: 'section', sectionId })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [sendSelection, onChange, pageId, refreshPreview])

  // Tell the preview iframe that a palette item is being dragged from the editor.
  const setDragBridged = useCallback((next: DragState) => {
    setDrag(next)
    const target = iframeRef.current?.contentWindow
    if (!target) return
    const message = next?.kind === 'palette'
      ? { active: true, kind: 'widget', widgetType: next.type }
      : next?.kind === 'palette-section'
        ? { active: true, kind: 'section', columns: next.columns }
        : { active: false }
    target.postMessage({ source: 'happ-builder-editor', type: 'palette-drag', ...message }, window.location.origin)
  }, [])

  useEffect(() => { if (view === 'live') sendSelection() }, [sel, view, sendSelection])

  // Per-post / per-product layout choice (WordPress-style).
  useEffect(() => {
    if (!entity || !entryId) return
    void fetch(`/api/admin/builder/post-template?${entity}Id=${entryId}`, { cache: 'no-store' })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setPostTpl({ templateId: data.templateId || '', options: data.options || [] })
      })
      .catch(() => undefined)
  }, [entity, entryId])

  // The magazine's page styles, offered to an article template (layout.postStyle).
  const [postStyles, setPostStyles] = useState<LayoutOption[]>([])
  useEffect(() => {
    if (templateKind !== 'post') return
    void fetch('/api/admin/builder/post-template?options=post', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setPostStyles((data?.options || []).filter((option: LayoutOption) => option.group === 'style' || option.group === 'mystyle')))
      .catch(() => undefined)
  }, [templateKind])

  // Header / footer templates for the page-frame choice.
  useEffect(() => {
    if (templateKind === 'header' || templateKind === 'footer') return
    void fetch('/api/admin/theme-templates', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setChromeTemplates((data?.templates || []).filter((tpl: ChromeTemplate) => tpl.type === "header" || tpl.type === "footer")))
      .catch(() => undefined)
  }, [templateKind])

  const changePostTemplate = useCallback(async (templateId: string) => {
    if (!entity || !entryId) return
    setBusy(true)
    const response = await fetch('/api/admin/builder/post-template', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [`${entity}Id`]: entryId, templateId }),
    }).catch(() => null)
    if (response?.ok) {
      setPostTpl((previous) => (previous ? { ...previous, templateId } : previous))
      refreshPreview()
      setMessage(L('Layout updated.', 'قالب به‌روزرسانی شد.'))
    } else {
      const data = await response?.json().catch(() => null)
      setMessage(data?.error || L('Could not change the layout.', 'تغییر قالب ممکن نشد.'))
    }
    setBusy(false)
  }, [entity, entryId, L, refreshPreview])

  const saveRef = useRef(save)
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  useEffect(() => { saveRef.current = save; undoRef.current = undo; redoRef.current = redo }, [save, undo, redo])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') { event.preventDefault(); void save(); return }
      // Inside text fields Ctrl+Z is the field's own undo.
      if (isTyping(event.target)) return
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo() }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, undo, redo])

  useEffect(() => {
    const onBefore = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [dirty])

  const handleAddWidget = (type: WidgetType) => {
    if (!doc) return
    let target: { sectionId: string; columnId: string } | null = null
    if (sel?.kind === 'widget' || sel?.kind === 'column') target = { sectionId: sel.sectionId, columnId: sel.columnId }
    else if (sel?.kind === 'section') {
      const section = doc.sections.find((item) => item.id === sel.sectionId)
      if (section?.columns[0]) target = { sectionId: section.id, columnId: section.columns[0].id }
    }
    if (!target) {
      const last = doc.sections[doc.sections.length - 1]
      if (last?.columns[0]) target = { sectionId: last.id, columnId: last.columns[0].id }
      else {
        const created = addSectionOp(doc, 1)
        const column = created.doc.sections[created.doc.sections.length - 1].columns[0]
        onChange(created.doc, created.sel)
        const result = addWidget(created.doc, created.doc.sections[created.doc.sections.length - 1].id, column.id, type)
        onChange(result.doc, result.sel)
        return
      }
    }
    const result = addWidget(doc, target.sectionId, target.columnId, type)
    onChange(result.doc, result.sel)
  }

  const handleDropWidget = (to: { sectionId: string; columnId: string; index?: number }) => {
    if (!doc || !drag) return
    if (drag.kind === 'widget') {
      const result = moveWidget(doc, drag.ref, to)
      onChange(result.doc, result.sel)
    } else if (drag.kind === 'palette') {
      const result = addWidget(doc, to.sectionId, to.columnId, drag.type, to.index)
      onChange(result.doc, result.sel)
    }
    setDrag(null)
  }

  const handleDropSection = (toId: string) => {
    if (!doc || !drag) return
    if (drag.kind === 'section') onChange(moveSection(doc, drag.sectionId, toId), sel || undefined, true)
    else if (drag.kind === 'palette-section') { const result = insertSectionAt(doc, drag.columns, toId); onChange(result.doc, result.sel) }
    setDrag(null)
  }

  const handleDropEmptyCanvas = () => {
    if (!doc || !drag) return
    if (drag.kind === 'palette') {
      const created = addSectionOp(doc, 1)
      const section = created.doc.sections[created.doc.sections.length - 1]
      const column = section.columns[0]
      const result = addWidget(created.doc, section.id, column.id, drag.type)
      onChange(result.doc, result.sel)
    } else if (drag.kind === 'palette-section') {
      const result = insertSectionAt(doc, drag.columns, null)
      onChange(result.doc, result.sel)
    }
    setDrag(null)
  }

  const duplicateSelection = () => {
    if (!doc || !sel) return
    if (sel.kind === 'widget') { const result = duplicateWidget(doc, { sectionId: sel.sectionId, columnId: sel.columnId, widgetId: sel.widgetId }); onChange(result.doc, result.sel) }
    else if (sel.kind === 'section') { const result = duplicateSection(doc, sel.sectionId); onChange(result.doc, result.sel) }
  }

  const removeSelection = () => {
    if (!doc || !sel) return
    if (sel.kind === 'widget') onChange(removeWidget(doc, { sectionId: sel.sectionId, columnId: sel.columnId, widgetId: sel.widgetId }), { kind: 'column', sectionId: sel.sectionId, columnId: sel.columnId })
    else if (sel.kind === 'section') { onChange(removeSection(doc, sel.sectionId), null); setSel(null) }
    else if (sel.kind === 'column') { onChange(removeColumn(doc, sel.sectionId, sel.columnId), { kind: 'section', sectionId: sel.sectionId }) }
  }

  const back = backTarget(pageId)
  if (loading || !doc) {
    return <div className="builder-workspace"><div className="card">{message || L('Loading builder…', 'بارگذاری صفحه‌ساز…')}</div>{message && <button className="btn btn-ghost" onClick={() => void load()}>{L('Retry', 'تلاش دوباره')}</button>}</div>
  }

  const title = fa ? meta?.title : meta?.titleEn
  const setMode = (mode: BuilderDoc['mode']) => { if (mode !== doc.mode) onChange({ ...doc, mode }, sel) }
  const setChrome = (part: 'header' | 'footer', value: string) => {
    const layout = { ...doc.layout, header: doc.layout?.header ?? 'default', footer: doc.layout?.footer ?? 'default', [part]: value }
    onChange({ ...doc, layout: layout as BuilderDoc['layout'] }, sel)
  }
  const chromeSelect = (part: 'header' | 'footer') => <select value={doc.layout?.[part] ?? 'default'} onChange={(event) => setChrome(part, event.target.value)}>
    <option value="default">{part === 'header' ? L('Site header (auto)', 'هدر سایت (خودکار)') : L('Site footer (auto)', 'فوتر سایت (خودکار)')}</option>
    <option value="none">{part === 'header' ? L('No header', 'بدون هدر') : L('No footer', 'بدون فوتر')}</option>
    {chromeTemplates.filter((tpl) => tpl.type === part).map((tpl) => <option key={tpl.id} value={tpl.id}>{L(tpl.nameEn || tpl.name, tpl.name)}{tpl.status !== 'published' ? L(' (draft)', ' (پیش‌نویس)') : ''}</option>)}
  </select>
  const showChrome = doc.mode === 'builder' && templateKind !== 'header' && templateKind !== 'footer' && templateKind !== 'surface'
  // An article template wears one of the magazine's page styles on its header and reading column (layout.postStyle).
  const setPostStyle = (value: string) => {
    const { postStyle: _previous, ...rest } = doc.layout || { header: 'default', footer: 'default' }
    void _previous
    onChange({ ...doc, layout: { header: rest.header ?? 'default', footer: rest.footer ?? 'default', ...(value ? { postStyle: value } : {}) } }, sel)
  }

  return <div className="builder-workspace">
    <header className="builder-head">
      <div>
        <Link href={back.href} className="muted text-sm">← {L(...back.label)}</Link>
        <h1>{L('Page builder', 'صفحه‌ساز')}</h1>
        <p>
          <b>{title || pageId}</b>
          {meta?.path && <span className="muted"> · <span dir="ltr" className="mono">{meta.path}</span></span>}
          {dirty && <span className="bld-dirty">{L(' · unsaved changes', ' · تغییرات ذخیره‌نشده')}</span>}
        </p>
      </div>
      <div className="builder-head-actions"><span className={`bld-sync is-${live.state}`} role="status">{live.state === 'syncing' ? 'همگام‌سازی پیش‌نمایش…' : live.state === 'error' ? 'پیش‌نمایش همگام نیست' : 'پیش‌نمایش همگام است'}</span>
        <button type="button" className="btn btn-ghost" aria-pressed={showAi} onClick={() => setShowAi(value => !value)}>دستیار طراحی</button><button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || uploading || !dirty}>
          {busy ? L('Saving…', 'در حال ذخیره…') : uploading ? L('Uploading…', 'در حال بارگذاری…') : dirty ? meta?.status === 'DRAFT' ? L('Save draft', 'ذخیره پیش‌نویس') : L('Save', 'ذخیره') : L('Saved ✓', 'ذخیره شد ✓')}
        </button><details className="bld-tool-menu"><summary>ابزارها و تنظیمات</summary><div className="bld-tool-content">
        <div className="bld-modes" role="tablist">
          <button type="button" role="tab" aria-selected={doc.mode === 'builder'} className={doc.mode === 'builder' ? 'is-selected' : ''} onClick={() => setMode('builder')}>{L('Builder', 'صفحه‌ساز')}</button>
          <button type="button" role="tab" aria-selected={doc.mode === 'code'} className={doc.mode === 'code' ? 'is-selected' : ''} onClick={() => setMode('code')}>{L('Code', 'کد')}</button>
        </div>
        {doc.mode === 'builder' && (
          <div className="bld-modes bld-views" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'live'} className={view === 'live' ? 'is-selected' : ''} onClick={() => setView('live')}>{L('Live preview', 'پیش‌نمایش زنده')}</button>
            <button type="button" role="tab" aria-selected={view === 'structure'} className={view === 'structure' ? 'is-selected' : ''} onClick={() => setView('structure')}>{L('Structure', 'ساختار')}</button>
          </div>
        )}
        <button
          type="button"
          className={`btn btn-ghost${panels.left ? '' : ' is-on'}`}
          aria-label={L('Toggle blocks panel', 'نمایش/مخفی‌کردن پنل بلوک‌ها')}
          title={L('Toggle blocks panel', 'نمایش/مخفی‌کردن پنل بلوک‌ها')}
          onClick={() => setPanels((previous) => ({ ...previous, left: !previous.left }))}
        >{L('◦ Blocks', '◦ بلوک‌ها')}</button>
        <button
          type="button"
          className={`btn btn-ghost${panels.right ? '' : ' is-on'}`}
          aria-label={L('Toggle settings panel', 'نمایش/مخفی‌کردن پنل تنظیمات')}
          title={L('Toggle settings panel', 'نمایش/مخفی‌کردن پنل تنظیمات')}
          onClick={() => setPanels((previous) => ({ ...previous, right: !previous.right }))}
        >{L('◧ Settings', '◧ تنظیمات')}</button>
        {templateKind === 'post' && doc.mode === 'builder' && postStyles.length > 0 && (
          <label className="bld-post-tpl" title={L('The magazine page style this article template wears', 'استایل صفحهٔ نوشته‌ای که این قالب می‌پوشد')}>
            <span>{L('Article style', 'استایل نوشته')}</span>
            <select value={doc.layout?.postStyle || ''} onChange={(event) => setPostStyle(event.target.value)}>
              <option value="">{L('Plain', 'ساده (بدون استایل)')}</option>
              {(['style', 'mystyle'] as const).map((group) => <optgroup key={group} label={group === 'style' ? L('Article styles', 'استایل‌های آماده') : L('My styles', 'استایل‌های من')}>
                {postStyles.filter((option) => option.group === group).map((option) => <option key={option.id} value={option.id}>{L(option.en, option.fa)}</option>)}
              </optgroup>)}
            </select>
          </label>
        )}
        {showChrome && (
          <>
            <label className="bld-post-tpl" title={L('Header of this page', 'هدر این صفحه')}><span>{L('Header', 'هدر')}</span>{chromeSelect('header')}</label>
            <label className="bld-post-tpl" title={L('Footer of this page', 'فوتر این صفحه')}><span>{L('Footer', 'فوتر')}</span>{chromeSelect('footer')}</label>
          </>
        )}
        {postTpl && (
          <label className="bld-post-tpl">
            <span>{entity === 'product' ? L('Product layout', 'قالب محصول') : L('Post layout', 'قالب مقاله')}</span>
            <select value={postTpl.templateId} disabled={busy} onChange={(event) => void changePostTemplate(event.target.value)}>
              <option value="">{L('Automatic (theme rules)', 'خودکار (طبق شرط‌ها)')}</option>
              {(['style', 'mystyle', 'theme', 'builtin', 'mine'] as const).map((group) => {
                const list = postTpl.options.filter((option) => option.group === group)
                if (!list.length) return null
                return <optgroup key={group} label={group === 'style' ? L('Article styles', 'استایل‌های نوشته') : group === 'mystyle' ? L('My styles', 'استایل‌های من') : group === 'theme' ? L('Theme templates', 'قالب‌های سازنده') : group === 'builtin' ? L('Built-in', 'آماده') : L('My saved templates', 'قالب‌های ذخیره‌شده')}>
                  {list.map((option) => <option key={option.id} value={option.id}>{L(option.en, option.fa)}{option.status === 'draft' ? L(' (draft)', ' (پیش‌نویس)') : ''}</option>)}
                </optgroup>
              })}
            </select>
          </label>
        )}
        <button type="button" className="btn btn-ghost" onClick={undo} disabled={!past.length} title="Ctrl+Z">{L('Undo', 'بازگردانی')}</button>
        <button type="button" className="btn btn-ghost" onClick={redo} disabled={!future.length} title="Ctrl+Shift+Z">{L('Redo', 'دوباره')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setShowTemplates(true)}>{L('Templates', 'قالب‌ها')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setShowKit(true)}>{L('Global kit', 'کیت سراسری')}</button>
        {meta?.path && <Link className="btn btn-ghost" href={meta.status === 'DRAFT' ? previewSrc : meta.path} target="_blank">{meta.status === 'DRAFT' ? L('Private preview ↗', 'پیش‌نمایش خصوصی ↗') : L('Open page ↗', 'نمایش صفحه ↗')}</Link>}
        {meta?.status && /^\d+$/.test(pageId) && <Link className="btn btn-ghost" href={`/admin/pages?edit=${pageId}`}>{L('Publication & page settings', 'انتشار و تنظیمات صفحه')}</Link>}
        <Link className="btn btn-ghost" href={`/admin/history?type=${encodeURIComponent(`builder:${pageId}`)}&id=1`} title={L('Every saved version of this design; an earlier one can be put back', 'هر نسخهٔ ذخیره‌شدهٔ این طرح؛ می‌توانید نسخهٔ قبلی را برگردانید')}>{L('History', 'تاریخچه')}</Link>

      </div></details></div>
    </header>
    {message && <p role="status" className="builder-status">{message}</p>}
    {live.error && <p className="builder-status" role="alert">{live.error} <button type="button" className="btn btn-ghost btn-sm" onClick={live.retry}>تلاش دوبارهٔ پیش‌نمایش</button></p>}
    {showAi && <AiDesignPanel pageId={pageId} doc={doc} close={() => setShowAi(false)} apply={next => onChange(next, null)} />}
    {meta?.status === 'DRAFT' && <p className="builder-status">{templateKind ? <>این قالب پیش‌نویس است؛ ذخیرهٔ طرح آن را منتشر نمی‌کند. <Link href="/admin/theme-builder">انتشار و شرط‌های نمایش</Link></> : L('This page is private. Saving the design keeps it a draft; review and publish it in Publication & page settings.', 'این صفحه پیش‌نویس است و عمومی نیست. ذخیرهٔ طرح آن را منتشر نمی‌کند؛ انتشار نهایی از «انتشار و تنظیمات صفحه» انجام می‌شود.')}</p>}
    {(meta?.status === 'PUBLISHED' || !!entry || pageId === 'home' || pageId === 'blog') && <p className="builder-status">ذخیرهٔ طرحِ محتوای منتشرشده، نمایش آن را به‌روز می‌کند. برای بررسی جداگانه ابتدا یک قالب پیش‌نویس بسازید.</p>}
    <div className={`builder-grid${panels.left ? '' : ' is-left-hidden'}${panels.right ? '' : ' is-right-hidden'}`}>
      {doc.mode === 'builder'
        ? <Palette
            doc={doc} sel={sel} L={L} drag={drag} setDrag={setDragBridged}
            pageId={pageId}
            onSelect={setSel}
            onAddSection={(count) => { const result = addSectionOp(doc, count); onChange(result.doc, result.sel) }}
            onAddWidget={handleAddWidget}
            onDropWidget={handleDropWidget}
            onDropSection={handleDropSection}
          />
        : <aside className="builder-panel">
            <h2>{L('Page code', 'کد صفحه')}</h2>
            <p className="muted text-sm">{L('Custom HTML/CSS replaces the builder canvas below. JavaScript requires advanced mode.', 'HTML/CSS سفارشی جای بوم صفحه‌ساز را می‌گیرد. جاوااسکریپت نیازمند حالت پیشرفته است.')}</p>
            <div className="bld-group">
              <h3>{L('Backup', 'پشتیبان')}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...doc, mode: 'builder' }, sel)}>{L('Back to builder canvas', 'بازگشت به بوم صفحه‌ساز')}</button>
            </div>
          </aside>}

      {doc.mode === 'builder'
        ? (view === 'live'
            ? (
              <div className="bld-preview-wrap">
                <div className="bld-preview-bar">
                  <span>{L('Live preview — click to select, drag to move, drop blocks from the left panel', 'پیش‌نمایش زنده — کلیک برای انتخاب، کشیدن برای جابه‌جایی، رهاکردن بلوک از پنل')}</span>
                  <div className="bld-preview-tools">
                    <div className="bld-modes bld-devices" role="tablist" aria-label={L('Preview width', 'عرض پیش‌نمایش')}>
                      {(['desktop', 'tablet', 'mobile'] as Device[]).map((entry) => <button
                        key={entry}
                        type="button"
                        role="tab"
                        aria-selected={device === entry}
                        className={device === entry ? 'is-selected' : ''}
                        onClick={() => setDevice(entry)}
                      >{entry === 'desktop' ? L('Desktop', 'دسکتاپ') : entry === 'tablet' ? L('Tablet', 'تبلت') : L('Mobile', 'موبایل')}</button>)}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPreview}>{L('Refresh', 'تازه‌سازی')}</button>
                  </div>
                </div>
                <LivePreviewFrame device={device} src={previewSrc} frameRef={iframeRef} title={L('Live preview', 'پیش‌نمایش زنده')} />
              </div>
            )
            : (
              <Canvas
                doc={doc} sel={sel} L={L} drag={drag} setDrag={setDragBridged}
                onSelect={setSel}
                onDropWidget={handleDropWidget}
                onDropSection={handleDropSection}
                onDropEmpty={handleDropEmptyCanvas}
              />
            )
          )
        : <CodePane doc={doc} L={L} onChange={(next) => onChange(next, sel, false)} />}

      <Inspector
        pageId={pageId}
        doc={doc} sel={sel} fa={fa} L={L}
        onBusy={setUploading}
        onChange={onChange}
        onDuplicate={duplicateSelection}
        onRemove={removeSelection}
      />
    </div>
    <KitPanel open={showKit} L={L} onClose={() => setShowKit(false)} onSaved={(text) => { setMessage(text); refreshPreview() }} />
    <TemplatesPanel
      open={showTemplates}
      pageId={pageId}
      currentDoc={doc}
      L={L}
      postTemplateId={postTpl?.templateId ?? null}
      onSetTemplate={isPost && postId ? changePostTemplate : undefined}
      onClose={() => setShowTemplates(false)}
      onInsert={(sections) => { const result = insertSections(doc, sections); onChange(result.doc, result.sel) }}
      onNotice={setMessage}
    />
  </div>
}
