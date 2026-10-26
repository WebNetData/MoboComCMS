'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BlockEditorKeyboardShortcuts, BlockEditorProvider, BlockInspector, BlockList, BlockToolbar, BlockTools, Inserter, ObserveTyping, WritingFlow, __experimentalListView as ListView, type EngineBlockObject } from '@wordpress/block-editor'
import { Popover, SlotFillProvider } from '@wordpress/components'
import { ShortcutProvider } from '@wordpress/keyboard-shortcuts'
import '@wordpress/components/build-style/style.css'
import '@wordpress/block-editor/build-style/style.css'
import './editor.css'
import Link from '@/components/AppLink'
import { engineName, fromEngineBlocks, toEngineBlocks } from '@/modules/editor/adapters/gutenberg/convert'
import { createRegistry } from '@/modules/editor/domain/core-blocks'
import { registryFromDescriptors, type BlockDescriptor } from '@/modules/editor/domain/descriptors'
import type { DocumentIssue, MoboComDocument } from '@/modules/editor/domain/document'
import { registerMoboComBlocks, toLiveBlocks } from './blocks'
import { legacyToEngineBlocks } from './legacy'
import { EditorEntityContext, ModulePreviewContext } from './module-preview-context'
import PatternLibrary from './PatternLibrary'
import DocumentProposalPreview from './DocumentProposalPreview'

export type EditorEntity = 'pages' | 'posts'
const NOUN: Record<EditorEntity, { one: string; list: string; path: string; form: string }> = { pages: { one: 'صفحه', list: 'صفحه‌ها', path: '/p/', form: '/admin/pages' }, posts: { one: 'نوشته', list: 'نوشته‌های مجله', path: '/blog/', form: '/admin/posts' } }

type Loaded = { blockDefinitions?: BlockDescriptor[]; id: number; slug: string; title: string; status: string; editorFormat: string; updatedAt: string; document: MoboComDocument; unsupported: Array<{ type: string }>; legacyHtml: string; enabled: boolean; canManagePatterns: boolean; editingMode?: 'live' | 'proposal' | 'preview'; proposalAt?: string | null; proposalStale?: boolean; liveHtml?: string; previewHtml?: string; startTemplate?: { id: number; title: string; document: MoboComDocument } | null }
type SaveState = { kind: 'clean' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'error'; message: string; issues?: DocumentIssue[] } | { kind: 'conflict' }

const AUTOSAVE_MS = 4000
const STATE_TEXT: Record<SaveState['kind'], string> = { clean: 'بدون تغییر', dirty: 'تغییر ذخیره‌نشده', saving: 'در حال ذخیره…', saved: 'ذخیره شد', error: 'ذخیره نشد', conflict: 'صفحه در جای دیگری تغییر کرده است' }

export default function BlockEditorApp({ entity, itemId }: { entity: EditorEntity; itemId: number }) {
  const noun = NOUN[entity], endpoint = `/api/admin/editor/${entity}/${itemId}`
  const [registry, setRegistry] = useState(() => createRegistry())
  const [page, setPage] = useState<Loaded | null>(null)
  const [failure, setFailure] = useState('')
  const [blocks, setBlocks] = useState<EngineBlockObject[]>([])
  const [state, setState] = useState<SaveState>({ kind: 'clean' })
  const [outline, setOutline] = useState(false)
  const [inspector, setInspector] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1101px)').matches)
  // An item written the old way opens with its body turned into blocks; how many pieces had no place in a document.
  const [converted, setConverted] = useState<{ dropped: number } | null>(null)
  // A new item that opened from the writer's role default template (nothing is stored until they save).
  const [started, setStarted] = useState<string | null>(null)
  const version = useRef(''), latest = useRef<EngineBlockObject[]>([]), saving = useRef(false), again = useRef(false)
  const proposalVersion = useRef<string | null>(null)
  const history = useRef<{ past: EngineBlockObject[][]; future: EngineBlockObject[][] }>({ past: [], future: [] })
  const [, redraw] = useState(0)

  useEffect(() => {
    setPage(null)
    let alive = true
    const preview = new URLSearchParams(window.location.search).get('proposal') === '1'
    fetch(endpoint + (preview ? '?proposal=1' : ''), { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (!alive) return
      if (!response.ok) return setFailure(body?.error || `خطا ${response.status}`)
      if (body.editingMode === 'preview') { setPage(body); return }
      const loadedRegistry = Array.isArray(body.blockDefinitions) ? registryFromDescriptors(body.blockDefinitions) : createRegistry()
      registerMoboComBlocks(loadedRegistry)
      const old = body.editorFormat === 'legacy' && String(body.legacyHtml || '').trim() ? legacyToEngineBlocks(body.legacyHtml, loadedRegistry) : null
      if (old) setConverted({ dropped: old.dropped })
      const template = !old && body.startTemplate?.document?.blocks?.length ? body.startTemplate : null
      if (template) setStarted(template.title)
      const live = toLiveBlocks(old ? old.blocks : toEngineBlocks(template ? template.document : body.document, loadedRegistry))
      version.current = body.updatedAt; latest.current = live
      proposalVersion.current = body.proposalAt ?? null
      setRegistry(loadedRegistry); setPage(body); setBlocks(live)
    }).catch(() => alive && setFailure('ارتباط با سرور برقرار نشد'))
    return () => { alive = false }
  }, [endpoint])

  const save = useCallback(async () => {
    // One save at a time; a change made while one is on its way is saved right after it, from the version that save returns.
    if (saving.current) { again.current = true; return }
    saving.current = true; setState({ kind: 'saving' })
    try {
      const sent = latest.current
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document: fromEngineBlocks(sent, registry), updatedAt: version.current, ...(page?.editingMode === 'proposal' ? { intent: 'proposal', proposalAt: proposalVersion.current } : {}) }) })
      const body = await response.json().catch(() => null)
      if (response.status === 409 && body?.code === 'CHANGED') { setState({ kind: 'conflict' }); again.current = false; return }
      if (!response.ok) { setState({ kind: 'error', message: body?.error || `خطا ${response.status}`, issues: body?.issues }); again.current = false; return }
      version.current = body.updatedAt
      proposalVersion.current = body.proposalAt ?? proposalVersion.current
      setPage((current) => (current ? { ...current, editorFormat: 'blocks-v1', updatedAt: body.updatedAt, ...(body.proposed ? { proposalAt: body.proposalAt } : {}) } : current))
      setConverted(null)
      setState(latest.current === sent && !again.current ? { kind: 'saved', at: Date.now() } : { kind: 'dirty' })
    } catch { setState({ kind: 'error', message: 'ارتباط با سرور برقرار نشد؛ تغییرها در همین صفحه مانده‌اند' }) } finally {
      saving.current = false
      if (again.current) { again.current = false; void save() }
    }
  }, [endpoint, registry, page?.editingMode])

  const change = useCallback((next: EngineBlockObject[], persistent: boolean) => {
    if (persistent && latest.current !== next) { history.current.past.push(latest.current); if (history.current.past.length > 100) history.current.past.shift(); history.current.future = [] }
    latest.current = next; setBlocks(next)
    setState((current) => (current.kind === 'conflict' ? current : { kind: 'dirty' }))
  }, [])
  const step = (from: 'past' | 'future') => {
    const target = history.current[from].pop()
    if (!target) return
    history.current[from === 'past' ? 'future' : 'past'].push(latest.current)
    latest.current = target; setBlocks(target); setState({ kind: 'dirty' }); redraw((n) => n + 1)
  }

  // Saved by itself a moment after the last change; never while the page is known to have changed elsewhere.
  useEffect(() => {
    // First conversion is an explicit save, especially when some legacy pieces could not be converted.
    if (state.kind !== 'dirty' || !page?.enabled || page.editingMode === 'proposal' || converted) return
    const timer = setTimeout(() => void save(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [state, blocks, page?.enabled, page?.editingMode, converted, save])
  // Leaving with unsaved work asks first.
  useEffect(() => {
    const unsaved = state.kind === 'dirty' || state.kind === 'saving' || state.kind === 'error' || state.kind === 'conflict'
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.kind])

  if (failure) return <div className="mc-editor-message" role="alert">{failure} <Link href="/admin/editor">بازگشت</Link></div>
  if (!page) return <div className="mc-editor-message" aria-busy="true">در حال بارگذاری ویرایشگر…</div>
  if (page.editingMode === 'preview') return <DocumentProposalPreview title={page.title} itemId={itemId} liveHtml={page.liveHtml || ''} previewHtml={page.previewHtml || ''} stale={!!page.proposalStale} />

  return (
    <EditorEntityContext.Provider value={entity}><ModulePreviewContext.Provider value={`${endpoint}/preview`}><ShortcutProvider className="mc-editor" dir="rtl">
      <SlotFillProvider>
        <BlockEditorProvider value={blocks} onInput={(next) => change(next, false)} onChange={(next) => change(next, true)} settings={{ allowedBlockTypes: registry.list().map(definition => engineName(definition.type)), hasFixedToolbar: true, isRTL: true, bodyPlaceholder: 'یک بلوک اضافه کنید', codeEditingEnabled: false, canLockBlocks: page.canManagePatterns, __experimentalBlockPatterns: [], __experimentalBlockPatternCategories: [] }}>
          <div className="mc-editor-top">
          <header className="mc-editor-bar">
            <div className="mc-editor-heading"><Link href={noun.form} className="mc-editor-back">بازگشت به {noun.list}</Link><h1 className="mc-editor-title">{page.title}</h1><p>{page.editingMode === 'proposal' ? 'ویرایش پیشنهادی برای بررسی سردبیر' : 'فضای نوشتن و چیدمان محتوا'}</p></div>
            <div className="mc-editor-actions">
            <span className={`mc-editor-state is-${state.kind}`} role="status" aria-live="polite">{state.kind === 'saved' && page.editingMode === 'proposal' ? 'پیشنهاد ارسال شد' : STATE_TEXT[state.kind]}{state.kind === 'error' ? `: ${state.message}` : ''}</span>
            <a className="mc-editor-tool" href={`${noun.path}${page.slug}`} target="_blank" rel="noreferrer">دیدن {noun.one}</a>
            <button type="button" className="mc-editor-save" onClick={() => void save()} disabled={!page.enabled || !!page.proposalStale || state.kind === 'saving' || state.kind === 'conflict'}>{page.editingMode === 'proposal' ? 'ارسال پیشنهاد متن' : converted?.dropped ? 'تأیید تبدیل و ذخیره' : 'ذخیره'}</button>
            </div>
          </header>
          <nav className="mc-editor-worktools" aria-label="ابزارهای ویرایشگر">
            <div className="mc-editor-insert"><Inserter position="bottom right" /><span>افزودن بلوک</span></div>
            <div className="mc-editor-history" aria-label="واگرد و ازنو">
            <button type="button" className="mc-editor-tool" onClick={() => step('past')} disabled={!history.current.past.length} aria-label="واگرد">↶</button>
            <button type="button" className="mc-editor-tool" onClick={() => step('future')} disabled={!history.current.future.length} aria-label="ازنو">↷</button>
            </div>
            <button type="button" className="mc-editor-tool" onClick={() => setOutline((open) => !open)} aria-expanded={outline} aria-controls="mc-outline">فهرست بلوک‌ها</button>
            <button type="button" className="mc-editor-tool" onClick={() => setInspector((open) => !open)} aria-expanded={inspector} aria-controls="mc-inspector">تنظیمات بلوک</button>
            <span className="mc-editor-save-hint">{page.editingMode === 'proposal' ? 'ارسال با تأیید شما' : 'ذخیرهٔ خودکار پس از تغییر'}</span>
          </nav>
          {/* The tools of the selected block: move, duplicate, remove. Fixed here, so they never cover what is being written. */}
          <div className="mc-editor-blocktools" aria-label="ابزار بلوک انتخاب‌شده"><BlockToolbar hideDragHandle /></div>
          </div>
          {page.enabled && <PatternLibrary entity={entity} registry={registry} canManage={page.canManagePatterns} current={() => latest.current} apply={(inserted, replace) => change(replace ? inserted : [...latest.current, ...inserted], true)} />}
          {!page.enabled ? <p className="mc-editor-notice" role="alert">افزونهٔ ویرایشگر بلوکی غیرفعال است؛ می‌توانید بچینید، ولی ذخیره نمی‌شود. از صفحهٔ افزونه‌ها فعالش کنید.</p> : null}
          {page.editingMode === 'proposal' && <p className={`mc-editor-notice${page.proposalStale ? ' is-error' : ''}`} role={page.proposalStale ? 'alert' : 'note'}>{page.proposalStale ? 'نسخهٔ منتشرشده بعد از این پیشنهاد تغییر کرده است. متن پیشنهادی شما محفوظ است؛ سردبیر باید آن را برگرداند تا از نسخهٔ جدید شروع کنید.' : page.proposalAt ? 'پیشنهاد در انتظار بررسی باز شده است. تغییرات جدید فقط با زدن «ارسال پیشنهاد متن» ثبت می‌شوند؛ مقالهٔ منتشرشده تغییر نمی‌کند.' : 'متن را ویرایش و برای سردبیر ارسال کنید. تا تأیید او، نسخهٔ منتشرشده حفظ می‌شود.'}</p>}
          {started ? <p className="mc-editor-notice" role="status">این {noun.one} از قالب «{started}»، قالب پیش‌فرض نقش شما، شروع شده است. تا ذخیره نکنید چیزی ثبت نمی‌شود. <button type="button" className="mc-editor-tool" onClick={() => { setStarted(null); change([], true) }}>شروع از صفحهٔ خالی</button></p> : null}
          {converted ? <p className="mc-editor-notice">این {noun.one} با ویرایشگر قدیمی نوشته شده بود و متنش اینجا به بلوک تبدیل شده است. تا ذخیره نکنید چیزی عوض نمی‌شود؛ پس از ذخیره، متن قدیمی در تاریخچه می‌ماند و قابل بازگردانی است.{converted.dropped ? ` ${converted.dropped.toLocaleString('fa-IR')} مورد (مثل تصویرِ میان متن یا قابِ سایت دیگر) در بلوک‌ها جایی نداشت و نیامده است؛ پیش از ذخیره نگاه کنید.` : ''}</p> : null}
          {page.unsupported.length ? <p className="mc-editor-notice">{page.unsupported.length.toLocaleString('fa-IR')} بلوک پشتیبانی نمی‌شود ({[...new Set(page.unsupported.map((item) => item.type))].join('، ')}). دست‌نخورده می‌مانند.</p> : null}
          {state.kind === 'conflict' ? <p className="mc-editor-notice is-error" role="alert">این {noun.one} پس از باز شدن این ویرایشگر در جای دیگری ذخیره شده است. برای اینکه کار دیگری را از بین نبرید، ذخیره متوقف شد. کار خود را جایی نگه دارید و دوباره باز کنید.</p> : null}
          {state.kind === 'error' && state.issues?.length ? <ul className="mc-editor-notice is-error">{state.issues.slice(0, 8).map((issue, index) => <li key={index} dir="ltr">{issue.path}: {issue.message}</li>)}</ul> : null}
          <div className="mc-editor-body">
            {outline ? <aside id="mc-outline" className="mc-editor-outline" aria-label="فهرست بلوک‌ها"><h2>ساختار محتوا</h2><ListView /></aside> : null}
            <section className="mc-editor-canvas" aria-label="بوم نوشتن">
              <div className="mc-editor-sheet-label">متن {noun.one}</div>
              <BlockEditorKeyboardShortcuts.Register />
              <BlockTools>
                <WritingFlow className="mcb-document mc-editor-document"><ObserveTyping><BlockList /></ObserveTyping></WritingFlow>
              </BlockTools>
            </section>
            {inspector && <aside id="mc-inspector" className="mc-editor-inspector" aria-label="تنظیمات بلوک"><h2>تنظیمات بلوک</h2><BlockInspector /></aside>}
          </div>
          <Popover.Slot />
        </BlockEditorProvider>
      </SlotFillProvider>
    </ShortcutProvider></ModulePreviewContext.Provider></EditorEntityContext.Provider>
  )
}
