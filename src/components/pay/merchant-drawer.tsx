'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import s from './MerchantShell.module.css'

/** Native dialog supplies modal focus/Tab containment and makes the page inert. */
export default function MerchantDrawer({ children, open, onClose }: { children: ReactNode; open: boolean; onClose: () => void }) {
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
      else document.getElementById('merchant-content')?.focus({ preventScroll: true })
    }
  }, [open, onClose])
  return <dialog ref={dialog} id="merchant-mobile-navigation" className={s.drawer} aria-labelledby="merchant-menu-title"
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== dialog.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <div className={s.drawerHead}><div><strong id="merchant-menu-title">منوی پذیرندگان</strong><small>MoboCom Pay</small></div><button ref={closeButton} type="button" onClick={onClose} aria-label="بستن منو"><Icon name="close" size={20} /></button></div>
    <div className={s.drawerBody}>{children}</div>
  </dialog>
}
