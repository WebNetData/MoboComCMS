'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TEXT_DECORATIONS, renderBBCode } from '@/shared/content/bbcode'
import Icon from '@/components/site/Icon'

export default function DecorationInsert({ onOpen, onInsert }: { onOpen: () => string | void; onInsert: (html: string) => void }) {
  const [open, setOpen] = useState(false), [chosen, setChosen] = useState<string>('note'), [text, setText] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId()
  const item = TEXT_DECORATIONS.find(entry => entry.id === chosen) || TEXT_DECORATIONS[0]
  const code = text.trim() ? item.code.replace(/\][\s\S]*?\[\//, () => `]${text.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;')}[/`) : item.code
  useEffect(() => { if (!open) return; const panel = dialog.current, button = trigger.current, overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; panel?.showModal(); return () => { panel?.close(); document.body.style.overflow = overflow; button?.focus() } }, [open])
  const safePreview = renderBBCode(code.replace(/&(?!(?:#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
  return <><button ref={trigger} type="button" className="btn btn-ghost btn-sm ce-media" onClick={() => { setText(onOpen() || ''); setOpen(true) }}><Icon name="palette" size={16} />زیباسازی متن · BBCode</button>{open && createPortal(<dialog ref={dialog} className="ce-media-dialog ce-decoration-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); setOpen(false) }}>
    <header><div><span>متن خواناتر، نوشتهٔ زیباتر</span><h2 id={id}>زیباسازی متن</h2></div><button type="button" className="btn btn-ghost" aria-label="بستن زیباسازی متن" onClick={() => setOpen(false)}>✕</button></header>
    <div className="ce-decoration-layout"><div className="ce-decoration-choices" role="group" aria-label="نوع زیباسازی">{TEXT_DECORATIONS.map(entry => <button key={entry.id} type="button" aria-pressed={chosen === entry.id} onClick={() => setChosen(entry.id)}><b>{entry.name}</b><small>{entry.hint}</small></button>)}</div><div className="ce-decoration-workspace"><label htmlFor={id+'-body'}>متن شما</label><textarea id={id+'-body'} className="input" rows={5} value={text} maxLength={12000} placeholder="متن دلخواه را بنویسید…" onChange={event => setText(event.target.value)} /><span className="muted">پیش‌نمایش</span><div className="ce-decoration-preview" dangerouslySetInnerHTML={{ __html: safePreview }} /><details><summary>کد قابل استفاده در متن</summary><pre dir="ltr">{code}</pre></details></div></div>
    <footer><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>انصراف</button><button type="button" className="btn btn-primary" onClick={() => { onInsert(safePreview); setOpen(false); setText('') }}>درج در نوشته</button></footer>
  </dialog>, document.body)}</>
}
