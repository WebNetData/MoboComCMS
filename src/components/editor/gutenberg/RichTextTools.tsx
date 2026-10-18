'use client'

import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { TEXT_COLORS } from '@/modules/editor/domain/rich-text'

const COLORS = { accent: 'رنگ برند', muted: 'متن فرعی', success: 'سبز', warning: 'کهربایی', danger: 'قرمز' }

/** Toolbar extension for the existing rich-text field, not another editor or storage format. */
export default function RichTextTools({ editor, compact }: { editor: Editor; compact: boolean }) {
  const state = useEditorState({ editor, selector: ({ editor: current }) => ({ color: String(current.getAttributes('textStyle').color || ''), highlighted: current.isActive('highlight'), table: current.isActive('table') }) })
  const tableAction = (action: string) => {
    const chain = editor.chain().focus()
    switch (action) {
      case 'rowBefore': chain.addRowBefore().run(); break
      case 'rowAfter': chain.addRowAfter().run(); break
      case 'columnBefore': chain.addColumnBefore().run(); break
      case 'columnAfter': chain.addColumnAfter().run(); break
      case 'deleteRow': chain.deleteRow().run(); break
      case 'deleteColumn': chain.deleteColumn().run(); break
      case 'header': chain.toggleHeaderRow().run(); break
      case 'merge': chain.mergeCells().run(); break
      case 'split': chain.splitCell().run(); break
      case 'delete': chain.deleteTable().run(); break
    }
  }
  return <div className="mc-rich-extra" role="group" aria-label="رنگ و جدول">
    <label>رنگ متن<select aria-label="رنگ متن" value={state.color} onChange={event => { const color = event.target.value; if (color) editor.chain().focus().setMark('textStyle', { color }).run(); else editor.chain().focus().unsetMark('textStyle').run() }}><option value="">پیش‌فرض</option>{TEXT_COLORS.map(color => <option key={color} value={color}>{COLORS[color]}</option>)}</select></label>
    <button type="button" className={`mc-rich-button${state.highlighted ? ' is-active' : ''}`} aria-pressed={state.highlighted} onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleMark('highlight').run()}>هایلایت</button>
    {!compact && <button type="button" className="mc-rich-button" disabled={state.table} onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>افزودن جدول</button>}
    {state.table && <label>ویرایش جدول<select aria-label="ویرایش جدول" value="" onChange={event => tableAction(event.target.value)}><option value="">انتخاب عملیات…</option><option value="rowBefore">ردیف قبل</option><option value="rowAfter">ردیف بعد</option><option value="columnBefore">ستون قبل</option><option value="columnAfter">ستون بعد</option><option value="header">تغییر ردیف عنوان</option><option value="merge">ادغام سلول‌های انتخاب‌شده</option><option value="split">جدا کردن سلول ادغام‌شده</option><option value="deleteRow">حذف ردیف</option><option value="deleteColumn">حذف ستون</option><option value="delete">حذف جدول</option></select></label>}
  </div>
}
