'use client'

import { useCallback, useState } from 'react'

/** Decorative brand beside the seller's written name, including a readable missing-image fallback. */
export default function InvoiceLogo({ src, name, className }: { src: string; name: string; className: string }) {
  const [failed, setFailed] = useState('')
  const image = !!src && failed !== src
  // A resource can fail before hydration, before React can attach its error handler.
  const attach = useCallback((element: HTMLImageElement | null) => {
    if (element?.complete && element.naturalWidth === 0) setFailed(src)
  }, [src])
  return <span className={`${className}${image ? ' is-image' : ''}`} aria-hidden="true">
    {image ? <img ref={attach} src={src} alt="" width={160} height={64} decoding="async" onError={() => setFailed(src)} /> : (name || 'م').trim().slice(0, 1)}
  </span>
}
