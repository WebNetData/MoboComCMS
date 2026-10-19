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
import { ModulePreviewContext } from './module-preview-context'
import PatternLibrary from './PatternLibrary'

export type EditorEntity = 'pages' | 'posts'
const NOUN: Record<EditorEntity, { one: string; list: string; path: string; form: string }> = { pages: { one: 'صفحه', list: 'صفحه‌ها', path: '/p/', form: '/admin/pages' }, posts: { one: 'نوشته', list: 'نوشته‌های مجله', path: '/blog/', form: '/admin/posts' } }

type Loaded = { blockDefinitions?: BlockDescriptor[]; id: number; slug: string; title: string; status: string; editorFormat: string; updatedAt: string; document: MoboComDocument; unsupported: Array<{ type: string }>; legacyHtml: string; enabled: boolean; canManagePatterns: boolean }
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
  // An item written the old way opens with its body turned into blocks; how many pieces had no place in a document.
  const [converted, setConverted] = useState<{ dropped: number } | null>(null)
  const version = useRef(''), latest = useRef<EngineBlockObject[]>([]), saving = useRef(false), again = useRef(false)
  const history = useRef<{ past: EngineBlockObject[][]; future: EngineBlockObject[][] }>({ past: [], future: [] })
  const [, redraw] = useState(0)

  useEffect(() => {
    setPage(null)
    let alive = true
    fetch(endpoint, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (!alive) return
      if (!response.ok) return setFailure(body?.error || `خطا ${response.status}`)
      const loadedRegistry = Array.isArray(body.blockDefinitions) ? registryFromDescriptors(body.blockDefinitions) : createRegistry()
      registerMoboComBlocks(loadedRegistry)
      const old = body.editorFormat === 'legacy' && String(body.legacyHtml || '').trim() ? legacyToEngineBlocks(body.legacyHtml, loadedRegistry) : null
      if (old) setConverted({ dropped: old.dropped })
      const live = toLiveBlocks(old ? old.blocks : toEngineBlocks(body.document, loadedRegistry))
      version.current = body.updatedAt; latest.current = live
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
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ document: fromEngineBlocks(sent, registry), updatedAt: version.current }) })
      const body = await response.json().catch(() => null)
      if (response.status === 409 && body?.code === 'CHANGED') { setState({ kind: 'conflict' }); again.current = false; return }
      if (!response.ok) { setState({ kind: 'error', message: body?.error || `خطا ${response.status}`, issues: body?.issues }); again.current = false; return }
      version.current = body.updatedAt
      setPage((current) => (current ? { ...current, editorFormat: 'blocks-v1', updatedAt: body.updatedAt } : current))
      setConverted(null)
      setState(latest.current === sent && !again.current ? { kind: 'saved', at: Date.now() } : { kind: 'dirty' })
    } catch { setState({ kind: 'error', message: 'ارتباط با سرور برقرار نشد؛ تغییرها در همین صفحه مانده‌اند' }) } finally {
      saving.current = false
      if (again.current) { again.current = false; void save() }
    }
  }, [endpoint, registry])

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
    if (state.kind !== 'dirty' || !page?.enabled || converted) return
    const timer = setTimeout(() => void save(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [state, blocks, page?.enabled, converted, save])
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

  return (
    <ModulePreviewContext.Provider value={`${endpoint}/preview`}><ShortcutProvider className="mc-editor" dir="rtl">
      <SlotFillProvider>
        <BlockEditorProvider value={blocks} onInput={(next) => change(next, false)} onChange={(next) => change(next, true)} settings={{ allowedBlockTypes: registry.list().map(definition => engineName(definition.type)), hasFixedToolbar: true, isRTL: true, bodyPlaceholder: 'یک بلوک اضافه کنید', codeEditingEnabled: false, canLockBlocks: page.canManagePatterns, __experimentalBlockPatterns: [], __experimentalBlockPatternCategories: [] }}>
          <header className="mc-editor-bar">
            <Link href={noun.form} className="mc-editor-back">‹ {noun.list}</Link>
            <strong className="mc-editor-title">{page.title}</strong>
            <Inserter position="bottom right" />
            <button type="button" className="mc-editor-tool" onClick={() => step('past')} disabled={!history.current.past.length} aria-label="واگرد">↶</button>
            <button type="button" className="mc-editor-tool" onClick={() => step('future')} disabled={!history.current.future.length} aria-label="ازنو">↷</button>
            <button type="button" className="mc-editor-tool" onClick={() => setOutline((open) => !open)} aria-pressed={outline}>فهرست بلوک‌ها</button>
            <span className={`mc-editor-state is-${state.kind}`} role="status" aria-live="polite">{STATE_TEXT[state.kind]}{state.kind === 'error' ? `: ${state.message}` : ''}</span>
            <a className="mc-editor-tool" href={`${noun.path}${page.slug}`} target="_blank" rel="noreferrer">دیدن {noun.one}</a>
            <button type="button" className="mc-editor-save" onClick={() => void save()} disabled={!page.enabled || state.kind === 'saving' || state.kind === 'conflict'}>{converted?.dropped ? 'تأیید تبدیل و ذخیره' : 'ذخیره'}</button>
          </header>
          {page.enabled && <PatternLibrary entity={entity} registry={registry} canManage={page.canManagePatterns} current={() => latest.current} apply={(inserted, replace) => change(replace ? inserted : [...latest.current, ...inserted], true)} />}
          {/* The tools of the selected block: move, duplicate, remove. Fixed here, so they never cover what is being written. */}
          <div className="mc-editor-blocktools" aria-label="ابزار بلوک انتخاب‌شده"><BlockToolbar hideDragHandle /></div>
          {!page.enabled ? <p className="mc-editor-notice" role="alert">افزونهٔ ویرایشگر بلوکی غیرفعال است؛ می‌توانید بچینید، ولی ذخیره نمی‌شود. از صفحهٔ افزونه‌ها فعالش کنید.</p> : null}
          {converted ? <p className="mc-editor-notice">این {noun.one} با ویرایشگر قدیمی نوشته شده بود و متنش اینجا به بلوک تبدیل شده است. تا ذخیره نکنید چیزی عوض نمی‌شود؛ پس از ذخیره، متن قدیمی در تاریخچه می‌ماند و قابل بازگردانی است.{converted.dropped ? ` ${converted.dropped.toLocaleString('fa-IR')} مورد (مثل تصویرِ میان متن یا قابِ سایت دیگر) در بلوک‌ها جایی نداشت و نیامده است؛ پیش از ذخیره نگاه کنید.` : ''}</p> : null}
          {page.unsupported.length ? <p className="mc-editor-notice">{page.unsupported.length.toLocaleString('fa-IR')} بلوک پشتیبانی نمی‌شود ({[...new Set(page.unsupported.map((item) => item.type))].join('، ')}). دست‌نخورده می‌مانند.</p> : null}
          {state.kind === 'conflict' ? <p className="mc-editor-notice is-error" role="alert">این {noun.one} پس از باز شدن این ویرایشگر در جای دیگری ذخیره شده است. برای اینکه کار دیگری را از بین نبرید، ذخیره متوقف شد. کار خود را جایی نگه دارید و دوباره باز کنید.</p> : null}
          {state.kind === 'error' && state.issues?.length ? <ul className="mc-editor-notice is-error">{state.issues.slice(0, 8).map((issue, index) => <li key={index} dir="ltr">{issue.path}: {issue.message}</li>)}</ul> : null}
          <div className="mc-editor-body">
            {outline ? <aside className="mc-editor-outline" aria-label="فهرست بلوک‌ها"><ListView /></aside> : null}
            <main className="mc-editor-canvas">
              <BlockEditorKeyboardShortcuts.Register />
              <BlockTools>
                <WritingFlow className="mcb-document mc-editor-document"><ObserveTyping><BlockList /></ObserveTyping></WritingFlow>
              </BlockTools>
            </main>
            <aside className="mc-editor-inspector" aria-label="تنظیمات بلوک"><BlockInspector /></aside>
          </div>
          <Popover.Slot />
        </BlockEditorProvider>
      </SlotFillProvider>
    </ShortcutProvider></ModulePreviewContext.Provider>
  )
}
