'use client'

import { useEffect, useRef, useState } from 'react'
import type { DeliveryItem } from '@/modules/store/domain/delivery-details'

/** Card faces: flat tones (no gradients); text colour is read from the card itself when it is drawn. */
const FACES = [
  { id: 'ink', label: 'جوهری', dark: true },
  { id: 'brand', label: 'رنگ سایت', dark: true },
  { id: 'slate', label: 'سربی', dark: true },
  { id: 'sage', label: 'سبز ملایم', dark: false },
  { id: 'sand', label: 'کرم', dark: false },
  { id: 'rose', label: 'گلبهی', dark: false },
] as const
const MASK = '••••••••'

/** A quiet line pattern drawn over every face, the same in the page and in the saved image. */
const pattern = (ink: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><g fill="none" stroke="${ink}" stroke-opacity=".09" stroke-width="1.2">${Array.from({ length: 9 }, (_, index) => `<circle cx="600" cy="380" r="${90 + index * 46}"/>`).join('')}</g></svg>`
const patternUrl = (ink: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(pattern(ink))}")`
const loadImage = (src: string, cors = false) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); if (cors) image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = reject; image.src = src })

type Brand = { product: string; brand: string; logo: string }

/** The card as a PNG, drawn from what the card shows (its colours, fonts and rows) at twice its size. */
async function drawCard(card: HTMLElement, items: DeliveryItem[], brand: Brand, photo: string | null) {
  await document.fonts.ready
  const style = getComputedStyle(card), ink = style.color, font = getComputedStyle(document.body).fontFamily
  const W = 1200, pad = 64, rowHeight = 74, H = Math.max(756, 250 + items.length * rowHeight + pad)
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 44); ctx.clip()
  ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, W, H)
  if (photo) {
    const image = await loadImage(photo), scale = Math.max(W / image.width, H / image.height)
    ctx.drawImage(image, (W - image.width * scale) / 2, (H - image.height * scale) / 2, image.width * scale, image.height * scale)
    ctx.fillStyle = 'rgba(12, 14, 20, .5)'; ctx.fillRect(0, 0, W, H)
  }
  ctx.drawImage(await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(pattern(ink))}`), 0, 0, W, W * 380 / 600)
  ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.textAlign = 'right'
  let right = W - pad
  if (brand.logo) {
    const logo = await loadImage(brand.logo, true).catch(() => null)
    if (logo) { const size = 72; ctx.drawImage(logo, right - size, pad, size, size); right -= size + 20 }
  }
  ctx.font = `700 42px ${font}`; ctx.fillText(brand.brand, right, pad + 36)
  ctx.globalAlpha = .72; ctx.font = `500 28px ${font}`; ctx.fillText(brand.product, W - pad, pad + 128); ctx.globalAlpha = 1
  items.forEach((item, index) => {
    const y = H - pad - (items.length - 1 - index) * rowHeight - 18
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.globalAlpha = .72; ctx.font = `500 26px ${font}`; ctx.fillText(item.label, W - pad, y)
    ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.globalAlpha = 1; ctx.font = `600 32px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`; ctx.fillText(item.value, pad, y, W - pad * 2 - 260)
  })
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image')), 'image/png'))
}

const save = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }

/**
 * What a specialist delivered, as a card (owner 2026-11-12, «like an Apple ID card»): the site's name and logo, the
 * product, and the rows marked for the card; rows marked «beside the card» (security questions) sit next to it. The
 * buyer picks a face or a photo of their own (it stays in their browser) and saves the card as an image or the whole
 * delivery as a text file.
 */
export default function DeliveryCard({ orderId, items, brand, text }: { orderId: number; items: DeliveryItem[]; brand: Brand; text: string }) {
  const onCard = items.filter((item) => !item.aside), aside = items.filter((item) => item.aside)
  const [face, setFace] = useState<string>('ink')
  const [photo, setPhoto] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const hasSecret = onCard.some((item) => item.secret)
  const lines = photo || FACES.find((item) => item.id === face)?.dark ? '#ffffff' : '#000000'

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo) }, [photo])
  const flash = (what: string) => { setDone(what); setTimeout(() => setDone((current) => current === what ? '' : current), 1600) }
  const copy = async (value: string, what: string) => { try { await navigator.clipboard.writeText(value); flash(what) } catch { /* clipboard blocked: the value is on screen */ } }
  async function image() {
    if (!card.current) return
    setBusy(true)
    try { save(await drawCard(card.current, onCard, brand, photo), `order-${orderId}-card.png`); flash('image') } catch { flash('image-failed') } finally { setBusy(false) }
  }

  return <div className="sx-dcard-wrap">
    <div className="sx-dcard-stage">
      <div ref={card} className={`sx-dcard is-${photo ? 'photo' : face}`} style={{ backgroundImage: `${patternUrl(lines)}${photo ? `, linear-gradient(rgba(12, 14, 20, .5), rgba(12, 14, 20, .5)), url("${photo}")` : ''}` }}>
        <div className="sx-dcard-head">
          {brand.logo && <img src={brand.logo} alt="" width={36} height={36} />}
          <b>{brand.brand}</b>
          {hasSecret && <button type="button" className="sx-dcard-eye" aria-pressed={shown} onClick={() => setShown((value) => !value)}>{shown ? 'پنهان کردن رمز' : 'نمایش رمز'}</button>}
        </div>
        <span className="sx-dcard-product">{brand.product}</span>
        <dl className="sx-dcard-rows">{onCard.map((item, index) => <div key={`${item.label}-${index}`}>
          <dt>{item.label}</dt>
          <dd><button type="button" dir="ltr" aria-label={`کپی ${item.label}`} onClick={() => void copy(item.value, `row-${index}`)}>{item.secret && !shown ? MASK : item.value}</button>{done === `row-${index}` && <span className="sx-dcard-copied" role="status">کپی شد</span>}</dd>
        </div>)}</dl>
      </div>
      {aside.length > 0 && <dl className="sx-dcard-aside">{aside.map((item, index) => <div key={`${item.label}-${index}`}>
        <dt><bdi>{item.label}</bdi></dt>
        <dd><button type="button" dir="ltr" aria-label={`کپی پاسخ ${item.label}`} onClick={() => void copy(item.value, `aside-${index}`)}>{item.value}</button>{done === `aside-${index}` && <span className="sx-dcard-copied" role="status">کپی شد</span>}</dd>
      </div>)}</dl>}
    </div>

    <div className="sx-dcard-tools">
      <div className="sx-dcard-faces" role="radiogroup" aria-label="زمینهٔ کارت">
        {FACES.map((item) => <button key={item.id} type="button" role="radio" aria-checked={!photo && face === item.id} aria-label={item.label} title={item.label} className={`sx-dcard-face is-${item.id}`} onClick={() => { setPhoto(null); setFace(item.id) }} />)}
        <label className={`sx-dcard-photo${photo ? ' is-on' : ''}`}>
          <input type="file" accept="image/*" aria-label="تصویر زمینهٔ دلخواه" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPhoto(URL.createObjectURL(file)); event.target.value = '' }} />
          تصویر خودم
        </label>
      </div>
      <small className="sx-dcard-private">تصویر انتخابی شما فقط در همین مرورگر استفاده می‌شود و جایی ارسال نمی‌شود.</small>
      <div className="sx-dcard-actions">
        <button type="button" onClick={() => void copy(text, 'text')}>{done === 'text' ? 'کپی شد' : 'کپی متن'}</button>
        <button type="button" onClick={() => { save(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }), `order-${orderId}.txt`); flash('file') }}>{done === 'file' ? 'ذخیره شد' : 'فایل متنی'}</button>
        <button type="button" className="is-primary" disabled={busy} onClick={() => void image()}>{busy ? 'در حال ساخت…' : done === 'image' ? 'ذخیره شد' : done === 'image-failed' ? 'ساخت تصویر ممکن نشد' : 'ذخیرهٔ تصویر کارت'}</button>
      </div>
    </div>
  </div>
}
