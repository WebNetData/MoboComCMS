'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/site/Icon'
import { POPUP_KINDS, type PopupFace } from '@/modules/popups/domain/popups'
import './site-popup.css'

const LEAVE_MS = 180

/** The popup itself, also drawn in the panel's live preview. */
/** A builder-designed popup: the saved design in a frame sized to its content; its links open in this window. */
function PopupFrame({ src, title, onAction }: { src: string; title: string; onAction?: () => void }) {
  const [height, setHeight] = useState(320)
  const path = src.split('?')[0]
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      const m = event.data as { type?: string; path?: string; height?: number; href?: string } | null
      if (event.origin !== window.location.origin || !m || m.path !== path) return
      if (m.type === 'mobocom-popup-height' && typeof m.height === 'number') setHeight(Math.max(120, Math.min(m.height, Math.round(window.innerHeight * 0.8))))
      if (m.type === 'mobocom-popup-navigate' && typeof m.href === 'string') {
        const url = new URL(m.href, window.location.href)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return
        onAction?.()
        if (url.origin === window.location.origin) window.location.assign(url.href); else window.open(url.href, '_blank', 'noopener,noreferrer')
      }
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [path, onAction])
  return <iframe className="spp-frame" src={src} title={title} style={{ height }} loading="eager" />
}

export function PopupBody({ popup, onClose, onAction, frameSrc }: { popup: PopupFace; onClose?: () => void; onAction?: () => void; frameSrc?: string }) {
  if (popup.design === 'builder') return <div className="spp-card spp-built">
    {!popup.mustConfirm && <button type="button" className="spp-x" aria-label="بستن" onClick={onClose}><span aria-hidden="true">×</span></button>}
    <h2 className="sr-only" id="spp-title">{popup.title}</h2>
    {frameSrc ? <PopupFrame src={frameSrc} title={popup.title} onAction={onAction} /> : <p className="spp-note spp-frame-note">طراحی صفحه‌ساز پس از ذخیره و فعال‌سازی، همین‌جا داخل پنجره نمایش داده می‌شود.</p>}
    {popup.mustConfirm && <div className="spp-actions"><button type="button" className="spp-go" onClick={onClose}>{popup.closeLabel || 'متوجه شدم'}</button></div>}
  </div>

  const kind = POPUP_KINDS.find((item) => item.id === popup.kind) || POPUP_KINDS[0]
  const pictured = Boolean(popup.image) && (popup.design === 'cover' || popup.design === 'split')
  const external = /^https:/.test(popup.actionUrl)
  return <div className="spp-card">
    {!popup.mustConfirm && <button type="button" className="spp-x" aria-label="بستن" onClick={onClose}><span aria-hidden="true">×</span></button>}
    {pictured && <div className="spp-picture"><img src={popup.image} alt="" decoding="async" /></div>}
    <div className="spp-text">
      <span className="spp-mark">
        {popup.design === 'seal' || popup.design === 'spotlight' ? <span className="spp-seal"><Icon name={kind.icon} size={26} /></span> : null}
        <span className="spp-tag">{kind.label}</span>
      </span>
      <h2 className="spp-title" id="spp-title">{popup.title}</h2>
      {popup.body && <p className="spp-note">{popup.body}</p>}
      <div className="spp-actions">
        {popup.actionUrl && <a className="spp-go" href={popup.actionUrl} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={onAction}>{popup.actionLabel}</a>}
        {(popup.mustConfirm || popup.closeLabel || !popup.actionUrl) && <button type="button" className={popup.actionUrl ? 'spp-stay' : 'spp-go'} onClick={onClose}>{popup.closeLabel || (popup.mustConfirm ? 'متوجه شدم' : 'بستن')}</button>}
      </div>
    </div>
  </div>
}

/** A native dialog: it holds focus, sits above everything, and leaves the page inert. A corner popup does not stop the page. */
export default function PopupDialog({ popup, onClose, onAction, frameSrc }: { popup: PopupFace; onClose: () => void; onAction: () => void; frameSrc?: string }) {
  const box = useRef<HTMLDialogElement>(null)
  const [leaving, setLeaving] = useState(false)
  const corner = popup.position === 'corner'

  useEffect(() => {
    const dialog = box.current
    if (!dialog || dialog.open) return
    const before = document.activeElement as HTMLElement | null
    if (corner) { dialog.show(); if (before && before !== document.body) before.focus({ preventScroll: true }); else (document.activeElement as HTMLElement | null)?.blur() } else { dialog.showModal(); dialog.querySelector<HTMLElement>('.spp-go')?.focus({ preventScroll: true }) }
    return () => { if (dialog.open) dialog.close() }
  }, [corner])

  const leave = () => { setLeaving(true); window.setTimeout(onClose, LEAVE_MS) }

  return <dialog
    ref={box}
    role={popup.kind === 'WARNING' ? 'alertdialog' : 'dialog'}
    aria-labelledby="spp-title"
    className={`spp is-${popup.kind.toLowerCase()} look-${popup.design} at-${popup.position} fx-${popup.effect}${leaving ? ' is-leaving' : ''}`}
    onCancel={(event) => { event.preventDefault(); if (!popup.mustConfirm) leave() }}
    onClick={(event) => { if (event.target === box.current && !popup.mustConfirm) leave() }}
  >
    <PopupBody popup={popup} onClose={leave} onAction={onAction} frameSrc={frameSrc} />
  </dialog>
}
