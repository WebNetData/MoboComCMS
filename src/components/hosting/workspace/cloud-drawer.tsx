'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import s from './cloud-shell.module.css'

export default function CloudDrawer({ children, open, onClose, name }: { children: ReactNode; open: boolean; onClose: () => void; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const box = dialog.current
    if (!box || !open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    box.showModal()
    closeButton.current?.focus({ preventScroll: true })
    const desktop = window.matchMedia('(min-width: 1101px)')
    const resized = () => { if (desktop.matches) onClose() }
    desktop.addEventListener('change', resized)
    resized()
    return () => {
      desktop.removeEventListener('change', resized)
      if (box.open) box.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true })
      else document.getElementById('cloud-content')?.focus({ preventScroll: true })
    }
  }, [open, onClose])
  return <dialog ref={dialog} id="cloud-mobile-navigation" className={s.drawer} aria-labelledby="cloud-menu-title" onClose={onClose}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== dialog.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <div className={s.drawerHead}><div><strong id="cloud-menu-title">منوی پنل ابری</strong><small>{name}</small></div><button ref={closeButton} type="button" onClick={onClose} aria-label="بستن منو"><Icon name="close" size={20} /></button></div>
    <div className={s.drawerBody}>{children}</div>
  </dialog>
}
