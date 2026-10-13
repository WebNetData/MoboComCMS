'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import type { Editor as TinyEditor } from 'tinymce'
// TinyMCE is served from this site's own bundle (no CDN, no cloud key). Community edition, GPL-2.0-or-later:
// see docs/agent/PLATFORM_DECISIONS.md §6F. Only plugins of the open-source edition are imported.
import tinymce from 'tinymce/tinymce'
import 'tinymce/models/dom/model'
import 'tinymce/themes/silver'
import 'tinymce/icons/default'
import 'tinymce/skins/ui/oxide/skin.js'
import 'tinymce/skins/ui/oxide/content.js'
import 'tinymce/skins/ui/oxide-dark/skin.js'
import 'tinymce/skins/ui/oxide-dark/content.js'
import 'tinymce/skins/content/default/content.js'
import 'tinymce/skins/content/dark/content.js'
import 'tinymce/plugins/advlist'
import 'tinymce/plugins/anchor'
import 'tinymce/plugins/autolink'
import 'tinymce/plugins/autoresize'
import 'tinymce/plugins/charmap'
import 'tinymce/plugins/codesample'
import 'tinymce/plugins/directionality'
import 'tinymce/plugins/fullscreen'
import 'tinymce/plugins/image'
import 'tinymce/plugins/link'
import 'tinymce/plugins/lists'
import 'tinymce/plugins/searchreplace'
import 'tinymce/plugins/table'
import 'tinymce/plugins/wordcount'
import { useI18n } from '@/i18n/LocaleProvider'
import { CLASSIC_TOOLBARS, QUICKTAGS, applyQuicktag, type ClassicToolbar } from '@/modules/editor/domain/classic'
import MediaLibrary from '@/components/editor/MediaLibrary'
import { TINYMCE_FA } from './tinymce-fa'

// The editor's own menus, tooltips and dialogs in Persian (registered once, used when the site is in Persian).
tinymce.addI18n('fa', TINYMCE_FA)

// The classic way of writing: a Visual tab (what you see is what is published) and a Text tab (the HTML itself,
// with the quick tags), one "add media" button above them. The value is always HTML; the server cleans it again
// on save (cleanRichText), so nothing typed in the Text tab can run on a page.

export interface ClassicEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  dir?: 'rtl' | 'ltr'
  minHeight?: number
  /** Which set of tools: the full one for staff content, a smaller one for short descriptions. */
  toolbar?: ClassicToolbar
  /** The tab a writer starts on. */
  startIn?: 'visual' | 'text'
  /** No picture upload (places where a picture has no home, like a plain description). */
  noMedia?: boolean
  /** Kept for callers of the older editor; the upload endpoint decides where files live. */
  assetSection?: string
  compact?: boolean
  ticketMode?: boolean
}

/** The fonts of the page, so the writing area inside its frame reads in the same face as the published article. */
function pageFontFaces(): string {
  const rules: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList
    try { list = sheet.cssRules } catch { continue } // a sheet from another origin cannot be read
    for (const rule of Array.from(list)) if (rule instanceof CSSFontFaceRule) rules.push(rule.cssText)
  }
  return rules.join('\n')
}

async function uploadPicture(file: Blob, name: string): Promise<string> {
  const form = new FormData()
  form.append('file', file, name)
  const response = await fetch('/api/admin/media', { method: 'POST', body: form })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.url) throw new Error(data?.error || 'بارگذاری تصویر انجام نشد')
  return String(data.url)
}

export default function ClassicEditor({ value, onChange, placeholder, dir = 'rtl', minHeight = 260, toolbar = 'full', startIn = 'visual', noMedia = false }: ClassicEditorProps) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (f: string, e: string) => (fa ? f : e)
  const id = useId()
  const [mode, setMode] = useState<'visual' | 'text'>(startIn)
  const [dark, setDark] = useState(false)
  const [ready, setReady] = useState(false)
  const [note, setNote] = useState('')
  const editor = useRef<TinyEditor | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  // The media library: opened by "add media", and by the picture dialog's own browse button (which waits for an address).
  const [library, setLibrary] = useState<null | { done?: (url: string, meta?: Record<string, string>) => void }>(null)

  // The editor's skin is chosen when it starts, so it restarts when the site's theme is switched.
  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.dataset.theme === 'dark')
    read()
    const watch = new MutationObserver(read)
    watch.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watch.disconnect()
  }, [])

  const insertHtml = useCallback((html: string) => {
    if (!html) return
    if (mode === 'visual' && editor.current) editor.current.insertContent(html)
    else {
      // In the Text tab the picture goes where the caret is.
      const at = area.current ? area.current.selectionStart : value.length
      onChange(value.slice(0, at) + html + value.slice(at))
    }
  }, [mode, value, onChange])

  const init = useMemo(() => ({
    skin_url: 'default',
    skin: dark ? 'oxide-dark' : 'oxide',
    content_css: dark ? 'dark' : 'default',
    menubar: false,
    language: fa ? 'fa' : undefined,
    language_load: false,
    promotion: false,
    directionality: dir,
    placeholder,
    min_height: minHeight + 90,
    max_height: 760,
    autoresize_bottom_margin: 24,
    toolbar_mode: 'wrap' as const,
    toolbar_sticky: true,
    plugins: ['advlist', 'anchor', 'autolink', 'autoresize', 'charmap', 'codesample', 'directionality', 'fullscreen', 'image', 'link', 'lists', 'searchreplace', 'table', 'wordcount'],
    toolbar: CLASSIC_TOOLBARS[toolbar],
    block_formats: fa ? 'پاراگراف=p; تیتر ۲=h2; تیتر ۳=h3; تیتر ۴=h4; متن قالب‌دار=pre' : 'Paragraph=p; Heading 2=h2; Heading 3=h3; Heading 4=h4; Preformatted=pre',
    // Addresses are kept as they were typed: no rewriting to relative paths, no entity soup in Persian text.
    convert_urls: false,
    relative_urls: false,
    entity_encoding: 'raw' as const,
    // Things that run or submit are never part of an article, whichever tab they were typed in.
    invalid_elements: 'script,style,object,embed,applet,form,button,select,textarea,meta,link,base',
    extended_valid_elements: 'iframe[src|width|height|title|allow|allowfullscreen|frameborder]',
    link_default_target: '_blank',
    link_assume_external_targets: 'https' as const,
    table_default_attributes: {},
    table_default_styles: {},
    image_caption: true,
    image_advtab: false,
    // A pasted or dropped picture becomes a file on this server, never a base64 blob inside the text.
    automatic_uploads: !noMedia,
    paste_data_images: !noMedia,
    images_file_types: 'jpeg,jpg,png,webp,gif',
    images_upload_handler: (blob: { blob: () => Blob; filename: () => string }) => uploadPicture(blob.blob(), blob.filename()),
    file_picker_types: 'image',
    file_picker_callback: (done: (url: string, meta?: Record<string, string>) => void) => setLibrary({ done }),
    content_style: `${typeof document === 'undefined' ? '' : pageFontFaces()}\nbody { font-family: ${typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily}; font-size: 15px; line-height: 2; padding: 6px 10px; } img { max-width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #8884; padding: 6px 10px; }`,
  }), [dark, dir, placeholder, minHeight, toolbar, fa, noMedia])

  function quicktag(tag: string) {
    const box = area.current
    if (!box) return
    const next = applyQuicktag(value, box.selectionStart, box.selectionEnd, tag, (label) => window.prompt(label) || '')
    if (!next) return
    onChange(next.value)
    requestAnimationFrame(() => { box.focus(); box.setSelectionRange(next.start, next.end) })
  }

  return <div className={`ce${dark ? ' is-dark' : ''}`} data-mode={mode}>
    {library && <MediaLibrary onClose={() => setLibrary(null)} onInsert={(html, choice) => { if (library.done) library.done(choice.width ? `${choice.url}?w=${choice.width}` : choice.url, { alt: choice.alt }); else insertHtml(html); setLibrary(null) }} />}
    <div className="ce-bar">
      {!noMedia && <>
        <button type="button" className="btn btn-ghost btn-sm ce-media" onClick={() => setLibrary({})}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4" /></svg>
          {L('افزودن رسانه', 'Add media')}
        </button>
      </>}
      {note && <span className="ce-note" role="status">{note}</span>}
      <div className="ce-tabs" role="tablist" aria-label={L('حالت ویرایش', 'Editing mode')}>
        <button type="button" role="tab" id={`${id}-visual`} aria-selected={mode === 'visual'} aria-controls={`${id}-panel`} className={mode === 'visual' ? 'is-on' : ''} onClick={() => { if (mode !== 'visual') { setReady(false); setMode('visual') } }}>{L('دیداری', 'Visual')}</button>
        <button type="button" role="tab" id={`${id}-text`} aria-selected={mode === 'text'} aria-controls={`${id}-panel`} className={mode === 'text' ? 'is-on' : ''} onClick={() => { editor.current = null; setMode('text') }}>{L('متن', 'Text')}</button>
      </div>
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}`} className="ce-panel">
      {mode === 'visual'
        ? <>
          {!ready && <div className="cms-editor-loading" aria-busy="true" style={{ minHeight }}>…</div>}
          <Editor key={dark ? 'dark' : 'light'} licenseKey="gpl" value={value} onEditorChange={(html) => onChange(html)} onInit={(_event, instance) => { editor.current = instance; setReady(true) }} init={init} />
        </>
        : <>
          <div className="ce-quicktags" role="toolbar" aria-label={L('برچسب‌های سریع', 'Quick tags')}>
            {QUICKTAGS.map((tag) => <button key={tag.id} type="button" onClick={() => quicktag(tag.id)} title={fa ? tag.fa : tag.en}>{tag.label}</button>)}
          </div>
          <textarea ref={area} className="ce-source" dir="ltr" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} style={{ minHeight: minHeight + 60 }} aria-label={L('کد HTML نوشته', 'HTML source')} />
        </>}
    </div>
  </div>
}
