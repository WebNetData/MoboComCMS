'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

const WIDTH = { desktop: 1440, tablet: 820, mobile: 390 } as const
/** Real CSS viewport width at a fitted zoom; narrowing the editor does not turn desktop into mobile. */
export default function LivePreviewFrame({ device, src, frameRef, title }: {
  device: keyof typeof WIDTH; src: string; frameRef: RefObject<HTMLIFrameElement | null>; title: string
}) {
  const stage = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 600, height: 600 }), [zoom, setZoom] = useState('fit')
  useEffect(() => {
    if (!stage.current) return
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize({ width: Math.max(1, entry.contentRect.width - 16), height: Math.max(240, entry.contentRect.height - 16) }) })
    observer.observe(stage.current); return () => observer.disconnect()
  }, [])
  const width = WIDTH[device], scale = zoom === 'fit' ? Math.min(1, size.width / width) : Number(zoom)
  const height = Math.max(280, size.height / scale)
  return <>
    <div className="bld-zoom-row"><span dir="ltr">{width}px · {Math.round(scale * 100)}%</span><label>بزرگ‌نمایی<select className="select" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">اندازهٔ مناسب بوم</option><option value="0.5">۵۰٪</option><option value="0.75">۷۵٪</option><option value="1">۱۰۰٪</option></select></label></div>
    <div ref={stage} className={`bld-preview-stage is-${device}`}><div className="bld-preview-size" style={{ width: width * scale, height: height * scale }}><iframe ref={frameRef} className="bld-preview-frame" style={{ inlineSize: width, blockSize: height, transform: `scale(${scale})` }} src={src} title={title} /></div></div>
  </>
}
