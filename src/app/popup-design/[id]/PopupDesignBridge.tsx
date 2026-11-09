'use client'

import { useEffect } from 'react'

/** Inside the popup frame: tells the dialog how tall the design is, and opens links in the main window. */
export default function PopupDesignBridge() {
  useEffect(() => {
    if (window.parent === window) return
    const send = () => window.parent.postMessage({ type: 'mobocom-popup-height', path: location.pathname, height: Math.ceil(document.documentElement.scrollHeight) }, location.origin)
    const observer = new ResizeObserver(send)
    observer.observe(document.body)
    send()
    const click = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || event.defaultPrevented) return
      event.preventDefault()
      window.parent.postMessage({ type: 'mobocom-popup-navigate', path: location.pathname, href: link.href }, location.origin)
    }
    document.addEventListener('click', click, true)
    return () => { observer.disconnect(); document.removeEventListener('click', click, true) }
  }, [])
  return null
}
