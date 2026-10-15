'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/site/Icon'
import { cornerColor, hasTransparency, removeBackground, visibleBox, type Pixels } from './background'

const MAX_WIDTH = 1600
const hex = (color: [number, number, number]) => `#${color.map((part) => part.toString(16).padStart(2, '0')).join('')}`

/** Draws pixels into a new canvas. */
function canvasOf(pixels: Pixels, box?: { x: number; y: number; width: number; height: number }) {
  const full = document.createElement('canvas')
  full.width = pixels.width; full.height = pixels.height
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
  if (!box) return full
  const cut = document.createElement('canvas')
  cut.width = box.width; cut.height = box.height
  cut.getContext('2d')!.drawImage(full, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
  return cut
}

/**
 * Takes an image file, offers to clear its flat background and empty margins, shows the result on light, dark and
 * see-through backgrounds, and uploads it (as PNG, so transparency survives) when the admin accepts it.
 */
export default function LogoEditor({ file, trim = true, onDone, onCancel }: { file: File; trim?: boolean; onDone: (url: string) => void; onCancel: () => void }) {
  const [source, setSource] = useState<Pixels | null>(null)
  const [background, setBackground] = useState<[number, number, number] | null>(null)
  const [alreadyClear, setAlreadyClear] = useState(false)
  const [remove, setRemove] = useState(true)
  const [tolerance, setTolerance] = useState(48)
  const [everywhere, setEverywhere] = useState(false)
  const [crop, setCrop] = useState(trim)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const result = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let live = true
    createImageBitmap(file).then((bitmap) => {
      const ratio = Math.min(1, MAX_WIDTH / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = { data: image.data, width: image.width, height: image.height }
      if (!live) return
      const clear = hasTransparency(pixels), color = clear ? null : cornerColor(pixels)
      setSource(pixels); setAlreadyClear(clear); setBackground(color); setRemove(Boolean(color))
    }).catch(() => { if (live) setError('این فایل خوانده نشد؛ یک تصویر PNG، JPG یا WebP انتخاب کنید.') })
    return () => { live = false }
  }, [file])

  useEffect(() => {
    if (!source) return
    const timer = setTimeout(() => {
      const cleared = remove && background ? removeBackground(source, background, tolerance, everywhere) : source
      const canvas = canvasOf(cleared, crop ? visibleBox(cleared) : undefined)
      result.current = canvas
      setPreview(canvas.toDataURL('image/png'))
    }, 120)
    return () => clearTimeout(timer)
  }, [source, background, remove, tolerance, everywhere, crop])

  async function accept() {
    if (!result.current) return
    setBusy(true); setError('')
    try {
      const blob = await new Promise<Blob | null>((resolve) => result.current!.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('تصویر آماده نشد.')
      const form = new FormData()
      form.append('file', blob, 'logo.png')
      const response = await fetch('/api/admin/media', { method: 'POST', body: form })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.url) throw new Error(data?.error || 'بارگذاری انجام نشد.')
      onDone(data.url)
    } catch (e) { setError(e instanceof Error ? e.message : 'بارگذاری انجام نشد.') } finally { setBusy(false) }
  }

  return <div className="br-editor" role="group" aria-label="آماده‌سازی لوگو">
    {error && <p className="br-alert is-bad" role="alert">{error}</p>}
    {!source && !error && <div className="br-skeleton" aria-busy="true" />}
    {source && <>
      <div className="br-editor-tools">
        {alreadyClear ? <p className="br-alert is-ok"><Icon name="check" size={16} /> این تصویر از قبل پس‌زمینهٔ شفاف دارد.</p>
          : background ? <>
            <label className="br-check"><input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} /> حذف پس‌زمینهٔ یکدست <span className="br-swatch" style={{ background: hex(background) }} title={hex(background)} /></label>
            {remove && <>
              <label className="br-range"><span>حساسیت: {tolerance.toLocaleString('fa-IR')}</span><input type="range" min={8} max={140} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} /><small>اگر لبه‌ها هنوز رنگ پس‌زمینه دارند بیشتر کنید؛ اگر بخشی از لوگو پاک شد کمتر کنید.</small></label>
              <label className="br-check"><input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} /> داخل حروف و شکل‌ها هم پاک شود <small>(مثل داخل حرف O)</small></label>
            </>}
          </> : <p className="br-alert">پس‌زمینهٔ یکدستی در گوشه‌های تصویر پیدا نشد؛ تصویر همان‌طور که هست استفاده می‌شود.</p>}
        <label className="br-check"><input type="checkbox" checked={crop} onChange={(e) => setCrop(e.target.checked)} /> حاشیهٔ خالی دور لوگو بریده شود</label>
      </div>
      <div className="br-results" aria-label="نتیجه روی پس‌زمینه‌های مختلف">
        {[['is-checker', 'شفاف'], ['is-light', 'روشن'], ['is-dark', 'تیره']].map(([tone, label]) => <figure key={tone} className={`br-result ${tone}`}>{preview && <img src={preview} alt="" />}<figcaption>{label}</figcaption></figure>)}
      </div>
      <div className="br-editor-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>انصراف</button>
        <button type="button" className="btn btn-primary" onClick={() => void accept()} disabled={busy || !preview}>{busy ? 'در حال بارگذاری…' : 'استفاده از این لوگو'}</button>
      </div>
    </>}
  </div>
}
