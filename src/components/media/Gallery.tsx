'use client'

import { useEffect, useState } from 'react'
import Slider from '@/components/site/Slider'
import { sized, srcSet } from '@/shared/media/image'

/** Screenshot strip with a keyboard-friendly lightbox. */
export default function Gallery({ images, fa }: { images: string[]; fa: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + (fa ? -1 : 1) + images.length) % images.length))
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i + (fa ? 1 : -1) + images.length) % images.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, images.length, fa])
  if (!images.length) return null
  return (
    <>
      <Slider className="gm-shots">{images.map((src, i) => <button key={src + i} type="button" onClick={() => setOpen(i)} aria-label={`${fa ? 'تصویر' : 'Screenshot'} ${i + 1}`}><img src={sized(src, 480)} srcSet={srcSet(src, 480)} alt="" loading="lazy" /></button>)}</Slider>
      {open !== null && (
        <div className="gm-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <button type="button" className="gm-lb-nav is-prev" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + images.length) % images.length) }} aria-label="previous">‹</button>
          <img src={images[open]} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="gm-lb-nav is-next" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % images.length) }} aria-label="next">›</button>
          <span className="gm-lb-count">{open + 1} / {images.length}</span>
        </div>
      )}
    </>
  )
}
