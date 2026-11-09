'use client'

import { useEffect } from 'react'

/** Inside the popup frame: tells the dialog how tall the design is, and opens links in the main window. */
export default function PopupDesignBridge() {
  useEffect(() => {
    if (window.parent === window) return
    // The design's own height: the document is never shorter than the frame, so it could not shrink to fit.
    const design = document.querySelector('.popup-design') || document.body
    const send = () => window.parent.postMessage({ type: 'mobocom-popup-height', path: location.pathname, height: Math.ceil(design.getBoundingClientRect().height) }, location.origin)
    const observer = new ResizeObserver(send)
    observer.observe(design)
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
