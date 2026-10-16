'use client'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LibraryAsset, LibraryKind } from '@/modules/media/domain/library'
import LibraryView from './LibraryView'
import './library.css'

export function LibraryDialog({ onClose, onSelect, kind, renderSelection }: { onClose: () => void; onSelect?: (asset: LibraryAsset) => void; kind?: LibraryKind; renderSelection?: (asset: LibraryAsset) => ReactNode }) {
  const box = useRef<HTMLDialogElement>(null)
  const title = useId()
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const dialog = box.current
    dialog?.showModal()
    return () => { dialog?.close(); document.body.style.overflow = overflow; before?.focus() }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(<dialog ref={box} aria-labelledby={title} className="mcl-dialog" onCancel={e => { e.preventDefault(); onClose() }}><header><h2 id={title}>کتابخانهٔ رسانه</h2><button type="button" className="btn btn-ghost" onClick={onClose} aria-label="بستن کتابخانه">✕</button></header><LibraryView kind={kind} onSelect={onSelect} renderSelection={renderSelection} /></dialog>, document.body)
}
export default function LibraryPicker({ onSelect, kind }: { onSelect: (asset: LibraryAsset) => void; kind?: LibraryKind }) {
  const [open, setOpen] = useState(false)
  return <><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>▧ انتخاب از کتابخانه</button>{open && <LibraryDialog kind={kind} onClose={() => setOpen(false)} onSelect={asset => { onSelect(asset); setOpen(false) }} />}</>
}
