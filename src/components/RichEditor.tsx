'use client'

import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Extension } from '@tiptap/core'
import { useI18n } from '@/i18n/LocaleProvider'
import { rewriteAssets } from '@/modules/downloads/domain/localize'

/**
 * Lightweight text-align support: StarterKit v3 has no textAlign extension, so we
 * add a `textAlign` attribute (style=text-align) to headings and paragraphs and
 * expose the `setTextAlign` command ourselves.
 */
const TextAlign = Extension.create({
  name: 'textAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.textAlign || null,
            renderHTML: (attrs) => (attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {}),
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setTextAlign:
        (align: 'left' | 'center' | 'right') =>
        ({ commands }: { commands: any }) =>
          ['paragraph', 'heading'].some((t) => commands.updateAttributes(t, { textAlign: align })),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textAlign: {
      setTextAlign: (align: 'left' | 'center' | 'right') => ReturnType
    }
  }
}

export interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  dir?: 'rtl' | 'ltr'
  minHeight?: number
  /** compact toolbar for ticket replies / short answers */
  compact?: boolean
  /** Ticket editor excludes image/data uploads and raw HTML source. */
  ticketMode?: boolean
  /** Upload folder for files copied from pasted content (staff editors only). */
  assetSection?: string
}

/**
 * Shared rich-text editor: used by the CMS (posts, pages), the support tickets
 * and anywhere else admins author formatted content. Output is HTML — always run
 * it through `cleanRichText` on the server before storing or rendering it.
 */
export default function RichEditor({ value, onChange, placeholder, dir = 'ltr', minHeight = 220, compact = false, ticketMode = false, assetSection = 'posts' }: RichEditorProps) {
  const { t } = useI18n()
  // Staff editors copy images/files of pasted content to this server (not ticket replies).
  const localizeOn = !ticketMode
  const [importing, setImporting] = useState<{ busy: boolean; text: string } | null>(null)
  const localizeRef = useRef<(auto: boolean) => void>(() => undefined)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [codeMode, setCodeMode] = useState(false)
  const [codeDraft, setCodeDraft] = useState('')
  const [fullscreen, setFullscreen] = useState(false)

  const editor = useEditor({
    // required for Next.js SSR — the editor can only render in the browser
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      }),
      Image.configure({ inline: false, HTMLAttributes: { loading: 'lazy' } }),
      Placeholder.configure({ placeholder: placeholder || t.editorPlaceholder }),
      TextAlign,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value || '',
    editorProps: {
      handlePaste: () => { setTimeout(() => localizeRef.current(true), 60); return false },
      handleDrop: () => { setTimeout(() => localizeRef.current(true), 60); return false },
      attributes: {
        dir,
        class: 'rich-editor-body prose',
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  })

  // keep the editor in sync when the parent loads/resets the value
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const next = value || ''
    if (next !== current && !(next === '' && current === '<p></p>')) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [value, editor])

  localizeRef.current = (auto: boolean) => { void localizeAssets(auto) }
  async function localizeAssets(auto: boolean) {
    if (!editor || !localizeOn || importing?.busy) return
    const html = editor.getHTML()
    const origin = typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : ''
    const external = [...html.matchAll(/<(?:img[^>]*\ssrc|a[^>]*\shref)="([^"]+)"/gi)].map((m) => m[1]).filter((url) => url.startsWith('data:image/') || (/^https?:/i.test(url) && (() => { try { const h = new URL(url.replace(/&amp;/g, '&')).hostname; return h !== origin && !h.endsWith(`.${origin}`) } catch { return false } })()))
    if (!external.length) { if (!auto) setImporting({ busy: false, text: 'تصویر یا فایلی از سایت دیگر در متن نیست.' }); return }
    setImporting({ busy: true, text: 'در حال انتقال تصاویر و فایل‌های متن به سرور سایت…' })
    try {
      const response = await fetch('/api/admin/content/localize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html, section: assetSection }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) { setImporting({ busy: false, text: data?.error || 'انتقال انجام نشد' }); return }
      const replacements = new Map<string, string>(data.replacements || [])
      if (replacements.size) {
        // Applied to the current text, so anything typed meanwhile is kept.
        const next = rewriteAssets(editor.getHTML(), replacements)
        editor.commands.setContent(next, { emitUpdate: true })
      }
      setImporting({ busy: false, text: data.failed?.length ? `${replacements.size.toLocaleString('fa-IR')} مورد به سرور منتقل شد؛ ${data.failed.length.toLocaleString('fa-IR')} مورد در دسترس نبود.` : replacements.size ? `${replacements.size.toLocaleString('fa-IR')} تصویر/فایل به سرور سایت منتقل شد.` : 'تصویر یا فایلی برای انتقال پیدا نشد.' })
    } catch { setImporting({ busy: false, text: 'ارتباط برقرار نشد' }) }
  }

  if (!editor) return <div className="rich-editor"><div className="rich-toolbar" /><div className="rich-editor-body" style={{ minHeight }} /></div>

  const Btn = ({ on, active, children, title }: { on: () => void; active?: boolean; children: React.ReactNode; title: string }) => (
    <button type="button" title={title} className={`rich-btn ${active ? 'rich-btn-on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={on}>
      {children}
    </button>
  )

  function addLink() {
    const previous = editor!.getAttributes('link').href || ''
    const url = window.prompt(t.editorLinkPrompt, previous)
    if (url === null) return
    if (url === '') {
      editor!.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function addImage() {
    const url = window.prompt(t.editorImagePrompt, 'https://')
    if (url) editor!.chain().focus().setImage({ src: url }).run()
  }

  /** embeds a local file as a base64 image — no upload endpoint required */
  function uploadImage(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) {
      window.alert(t.editorImageTooBig)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      editor?.chain().focus().setImage({ src: String(reader.result || ''), alt: file.name }).run()
      // Staff editors store the picture on the server instead of inside the text.
      if (localizeOn) setTimeout(() => localizeRef.current(true), 30)
    }
    reader.readAsDataURL(file)
  }

  function toggleCodeMode() {
    if (codeMode) {
      editor?.commands.setContent(codeDraft, { emitUpdate: true })
      setCodeMode(false)
    } else {
      setCodeDraft(editor?.getHTML() || '')
      setCodeMode(true)
    }
  }

  return (
    <div className={`rich-editor ${fullscreen ? 'rich-fullscreen' : ''}`}>
      <div className="rich-toolbar">
        <Btn title={t.editorBold} active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
        <Btn title={t.editorItalic} active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
        <Btn title={t.editorUnderline} active={editor.isActive('underline')} on={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Btn>
        {!ticketMode && <Btn title={t.editorStrike} active={editor.isActive('strike')} on={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>}
        <span className="rich-sep" />
        {!ticketMode && <><Btn title={t.editorParagraph} active={editor.isActive('paragraph') && !editor.isActive('blockquote')} on={() => editor.chain().focus().setParagraph().run()}>¶</Btn><Btn title={t.editorH2} active={editor.isActive('heading', { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn><Btn title={t.editorH3} active={editor.isActive('heading', { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn><Btn title={t.editorH4} active={editor.isActive('heading', { level: 4 })} on={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>H4</Btn><span className="rich-sep" /></>}
        <Btn title={t.editorBullets} active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()}>•</Btn>
        <Btn title={t.editorNumbers} active={editor.isActive('orderedList')} on={() => editor.chain().focus().toggleOrderedList().run()}>1.</Btn>
        {!ticketMode && <Btn title={t.editorTaskList} active={editor.isActive('taskList')} on={() => editor.chain().focus().toggleTaskList().run()}>☑</Btn>}
        <Btn title={t.editorQuote} active={editor.isActive('blockquote')} on={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
        {!ticketMode && <><Btn title={t.editorCodeInline} active={editor.isActive('code')} on={() => editor.chain().focus().toggleCode().run()}>⌗</Btn><Btn title={t.editorCode} active={editor.isActive('codeBlock')} on={() => editor.chain().focus().toggleCodeBlock().run()}>{'</>'}</Btn></>}
        <span className="rich-sep" />
        {!compact && !ticketMode && (
          <>
            <Btn title={t.editorAlignLeft} on={() => editor.chain().focus().setTextAlign('left').run()}>⇤</Btn>
            <Btn title={t.editorAlignCenter} active={editor.isActive({ textAlign: 'center' })} on={() => editor.chain().focus().setTextAlign('center').run()}>⇹</Btn>
            <Btn title={t.editorAlignRight} active={editor.isActive({ textAlign: 'right' })} on={() => editor.chain().focus().setTextAlign('right').run()}>⇥</Btn>
            <span className="rich-sep" />
          </>
        )}
        <Btn title={t.editorLink} active={editor.isActive('link')} on={addLink}>🔗</Btn>
        {!compact && !ticketMode && (
          <>
            <Btn title={t.editorImage} on={addImage}>🖼</Btn>
            <Btn title={t.editorUploadImage} on={() => fileInput.current?.click()}>📤</Btn>
            {localizeOn && <Btn title="انتقال تصاویر و فایل‌های سایت‌های دیگر به سرور همین سایت" on={() => void localizeAssets(false)}>⇩</Btn>}
          </>
        )}
        {!ticketMode && <Btn title={t.editorRule} on={() => editor.chain().focus().setHorizontalRule().run()}>―</Btn>}
        {!compact && !ticketMode && (
          <>
            <span className="rich-sep" />
            <Btn title={t.editorHtmlSource} active={codeMode} on={toggleCodeMode}>{'{ }'}</Btn>
            <Btn title={fullscreen ? t.editorExitFullscreen : t.editorFullscreen} active={fullscreen} on={() => setFullscreen((v) => !v)}>⛶</Btn>
          </>
        )}
        <span className="rich-sep" />
        <Btn title={t.editorUndo} on={() => editor.chain().focus().undo().run()}>↺</Btn>
        <Btn title={t.editorRedo} on={() => editor.chain().focus().redo().run()}>↻</Btn>
        {!ticketMode && <Btn title={t.editorClear} on={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>✕</Btn>}
      </div>
      {codeMode ? (
        <textarea
          className="rich-code"
          dir="ltr"
          spellCheck={false}
          value={codeDraft}
          onChange={(e) => setCodeDraft(e.target.value)}
          style={{ minHeight }}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
      {importing && <div className={`rich-import${importing.busy ? ' is-busy' : ''}`} role="status">{importing.text}{!importing.busy && <button type="button" onClick={() => setImporting(null)} aria-label="بستن">✕</button>}</div>}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) uploadImage(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
