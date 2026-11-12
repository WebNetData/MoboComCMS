'use client'

import { useEffect, useRef, useState } from 'react'
import { placeOf, type DeliveryItem } from '@/modules/store/domain/delivery-details'
import { CARD_PRESETS, presetOf, type DeliveryCardData } from '@/modules/store/domain/card-designs'
import CardFace from '@/components/store/card/CardFace'
import { drawCard, saveBlob } from '@/components/store/card/drawCard'

/**
 * What a specialist delivered, as a card (owner 2026-11-12: «like an Apple ID card», gift cards with their own look).
 * The product's design first; the buyer may pick another face or a photo of their own (it stays in their browser).
 * Rows placed beside the card (security questions) sit next to it. Saves as an image, or the whole delivery as text.
 */
export default function DeliveryCard({ orderId, items, card, text }: { orderId: number; items: DeliveryItem[]; card: DeliveryCardData; text: string }) {
  const aside = items.filter((item) => placeOf(item) === 'aside'), onCard = items.filter((item) => placeOf(item) !== 'aside')
  const [face, setFace] = useState<string>('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const hasSecret = onCard.some((item) => item.secret)
  const own = presetOf(card.design.preset)

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo) }, [photo])
  const flash = (what: string) => { setDone(what); setTimeout(() => setDone((current) => current === what ? '' : current), 1600) }
  const copy = async (value: string, what: string) => { try { await navigator.clipboard.writeText(value); flash(what) } catch { /* clipboard blocked: the value is on screen */ } }
  async function image() {
    const face = stage.current?.querySelector<HTMLElement>('[data-card-face]')
    if (!face) return
    setBusy(true)
    try { saveBlob(await drawCard(face), `order-${orderId}-card.png`); flash('image') } catch { flash('image-failed') } finally { setBusy(false) }
  }

  return <div className="sx-dcard-wrap">
    <div className="sx-dcard-stage" ref={stage}>
      <div className="sx-dcard-main">
        <CardFace design={card.design} brand={card.brand} product={card.product} items={onCard} shown={shown} face={face || undefined} photo={photo} copied={done} onCopy={(item, key) => void copy(item.value, key)} onReveal={() => undefined} />
        {hasSecret && <button type="button" className="sx-dcard-eye" aria-pressed={shown} onClick={() => setShown((value) => !value)}>{shown ? 'پنهان کردن رمز و کد' : card.design.reveal === 'scratch' ? 'نمایش کد بدون تراشیدن' : 'نمایش رمز و کد'}</button>}
      </div>
      {aside.length > 0 && <dl className="sx-dcard-aside">{aside.map((item, index) => <div key={`${item.label}-${index}`}>
        <dt><bdi>{item.label}</bdi></dt>
        <dd><button type="button" dir="ltr" aria-label={`کپی پاسخ ${item.label}`} onClick={() => void copy(item.value, `aside-${index}`)}>{item.value}</button>{done === `aside-${index}` && <span className="sx-dcard-copied" role="status">کپی شد</span>}</dd>
      </div>)}</dl>}
    </div>

    <div className="sx-dcard-tools">
      <div className="sx-dcard-faces" role="radiogroup" aria-label="طرح کارت">
        <button type="button" role="radio" aria-checked={!photo && !face} className="sx-dcard-face is-own" title={`طرح محصول: ${own.label}`} aria-label={`طرح محصول: ${own.label}`} style={{ background: own.bg === 'site' ? undefined : own.bg }} onClick={() => { setPhoto(null); setFace('') }}><span>طرح اصلی</span></button>
        {CARD_PRESETS.filter((preset) => preset.id !== card.design.preset).map((preset) => <button key={preset.id} type="button" role="radio" aria-checked={!photo && face === preset.id} aria-label={preset.label} title={preset.label} className="sx-dcard-face" style={{ background: preset.bg === 'site' ? undefined : preset.bg }} data-site={preset.bg === 'site' ? '1' : undefined} onClick={() => { setPhoto(null); setFace(preset.id) }} />)}
        <label className={`sx-dcard-photo${photo ? ' is-on' : ''}`}>
          <input type="file" accept="image/*" aria-label="تصویر زمینهٔ دلخواه" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPhoto(URL.createObjectURL(file)); event.target.value = '' }} />
          تصویر خودم
        </label>
      </div>
      <small className="sx-dcard-private">تصویر انتخابی شما فقط در همین مرورگر استفاده می‌شود و جایی ارسال نمی‌شود.</small>
      <div className="sx-dcard-actions">
        <button type="button" onClick={() => void copy(text, 'text')}>{done === 'text' ? 'کپی شد' : 'کپی متن'}</button>
        <button type="button" onClick={() => { saveBlob(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }), `order-${orderId}.txt`); flash('file') }}>{done === 'file' ? 'ذخیره شد' : 'فایل متنی'}</button>
        <button type="button" className="is-primary" disabled={busy} onClick={() => void image()}>{busy ? 'در حال ساخت…' : done === 'image' ? 'ذخیره شد' : done === 'image-failed' ? 'ساخت تصویر ممکن نشد' : 'ذخیرهٔ تصویر کارت'}</button>
      </div>
    </div>
  </div>
}
