'use client'

import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Extension } from '@tiptap/core'
import type { RichTextDoc } from '@/modules/editor/domain/rich-text'

/** Alignment and direction of a paragraph or heading, as attributes the document format knows. */
const BlockAttributes = Extension.create({
  name: 'mobocomBlockAttributes',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        textAlign: { default: null, parseHTML: (el) => (el as HTMLElement).style.textAlign || null, renderHTML: (attrs) => (attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {}) },
        dir: { default: null, parseHTML: (el) => (el as HTMLElement).getAttribute('dir'), renderHTML: (attrs) => (attrs.dir ? { dir: attrs.dir } : {}) },
      },
    }]
  },
})

/** The Tiptap extensions of MoboCom rich text: what the field edits with, and what an old HTML body is read with. */
export const richTextExtensions = [StarterKit.configure({ heading: { levels: [2, 3, 4, 5, 6] }, link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'] } }), TaskList, TaskItem.configure({ nested: true }), BlockAttributes]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Rich text of a block, edited with Tiptap and kept as Tiptap JSON. Nothing here produces HTML that
 * is stored: the value handed up is the editor's JSON, and the server checks it against the format.
 */
export default function RichTextField({ value, onChange, label, compact = false }: { value: RichTextDoc; onChange: (next: RichTextDoc) => void; label: string; compact?: boolean }) {
  const latest = useRef(value)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: richTextExtensions,
    content: value?.content?.length ? value : { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: { attributes: { class: 'mcb-content-richText mc-rich-input', dir: 'auto', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label } },
    onUpdate: ({ editor: current }) => { const json = current.getJSON() as RichTextDoc; latest.current = json; onChange(json) },
  })
  // A value that changed from outside (undo, a reload) replaces what the editor shows; its own edits do not loop back.
  useEffect(() => {
    if (!editor || same(value, latest.current)) return
    latest.current = value
    editor.commands.setContent(value?.content?.length ? value : { type: 'doc', content: [{ type: 'paragraph' }] }, { emitUpdate: false })
  }, [editor, value])
  if (!editor) return <div className="mc-rich-loading" aria-busy="true" />

  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs)
  const button = (title: string, text: string, active: boolean, run: () => void) => (
    <button type="button" key={title} className={`mc-rich-button${active ? ' is-active' : ''}`} title={title} aria-label={title} aria-pressed={active} onMouseDown={(event) => event.preventDefault()} onClick={run}>{text}</button>
  )
  const link = () => {
    const current = (editor.getAttributes('link').href as string | undefined) || ''
    const href = window.prompt('نشانی پیوند (خالی برای برداشتن)', current)
    if (href === null) return
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
  }
  const align = (textAlign: string | null) => editor.chain().focus().updateAttributes('paragraph', { textAlign }).updateAttributes('heading', { textAlign }).run()
  const direction = (dir: string | null) => editor.chain().focus().updateAttributes('paragraph', { dir }).updateAttributes('heading', { dir }).run()

  return (
    // Keys typed here are the text editor's: the block editor around it must not take Backspace, Enter or the arrows.
    <div className={`mc-rich${compact ? ' is-compact' : ''}`} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()} onCopy={(event) => event.stopPropagation()} onCut={(event) => event.stopPropagation()} onPaste={(event) => event.stopPropagation()}>
      <div className="mc-rich-toolbar" role="toolbar" aria-label={`ابزار ${label}`}>
        {button('پررنگ', 'B', is('bold'), () => editor.chain().focus().toggleBold().run())}
        {button('کج', 'I', is('italic'), () => editor.chain().focus().toggleItalic().run())}
        {button('زیرخط', 'U', is('underline'), () => editor.chain().focus().toggleUnderline().run())}
        {button('خط‌خورده', 'S', is('strike'), () => editor.chain().focus().toggleStrike().run())}
        {button('کد درون‌خطی', '</>', is('code'), () => editor.chain().focus().toggleCode().run())}
        {button('پیوند', '🔗', is('link'), link)}
        {!compact && [2, 3, 4].map((level) => button(`تیتر ${level}`, `H${level}`, is('heading', { level }), () => editor.chain().focus().toggleHeading({ level: level as 2 | 3 | 4 }).run()))}
        {button('فهرست', '•', is('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
        {button('فهرست شماره‌دار', '1.', is('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
        {!compact && button('فهرست کار', '☑', is('taskList'), () => editor.chain().focus().toggleTaskList().run())}
        {!compact && button('نقل‌قول', '❝', is('blockquote'), () => editor.chain().focus().toggleBlockquote().run())}
        {!compact && button('بلوک کد', '{ }', is('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run())}
        {!compact && button('راست‌چین', '⇥', is('paragraph', { textAlign: 'right' }), () => align(is('paragraph', { textAlign: 'right' }) ? null : 'right'))}
        {!compact && button('وسط‌چین', '↔', is('paragraph', { textAlign: 'center' }), () => align(is('paragraph', { textAlign: 'center' }) ? null : 'center'))}
        {!compact && button('چپ‌چین', '⇤', is('paragraph', { textAlign: 'left' }), () => align(is('paragraph', { textAlign: 'left' }) ? null : 'left'))}
        {!compact && button('جهت چپ به راست', 'LTR', is('paragraph', { dir: 'ltr' }), () => direction(is('paragraph', { dir: 'ltr' }) ? null : 'ltr'))}
        {!compact && button('جهت راست به چپ', 'RTL', is('paragraph', { dir: 'rtl' }), () => direction(is('paragraph', { dir: 'rtl' }) ? null : 'rtl'))}
        {button('واگرد', '↶', false, () => editor.chain().focus().undo().run())}
        {button('ازنو', '↷', false, () => editor.chain().focus().redo().run())}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
