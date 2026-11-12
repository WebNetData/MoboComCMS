'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { patternDataUrl, presetOf, type CardDesign } from '@/modules/store/domain/card-designs'
import { placeOf, type DeliveryItem } from '@/modules/store/domain/delivery-details'
import styles from './card.module.css'

export type CardBrand = { title: string; logo: string }
const MASK = '••••••••'
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789#@$%&*'
const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A secret that, once shown, settles from random characters into its value (a short one-time change). */
function Decode({ value, shown }: { value: string; shown: boolean }) {
  const [text, setText] = useState(shown ? value : MASK)
  useEffect(() => {
    if (!shown) { setText(MASK); return }
    if (still()) { setText(value); return }
    let frame = 0
    const start = performance.now(), length = 420
    const tick = (now: number) => {
      const done = Math.min(1, (now - start) / length), fixed = Math.floor(value.length * done)
      setText(value.slice(0, fixed) + Array.from(value.slice(fixed), (char) => char === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(''))
      if (done < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [shown, value])
  return <>{text}</>
}

/** A scratch-off strip over a gift card's code; scratching most of it (or the button beside the card) reveals it. */
function Scratch({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef(0)
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const { width, height } = element.getBoundingClientRect()
    element.width = Math.max(1, Math.round(width * 2)); element.height = Math.max(1, Math.round(height * 2))
    ctx.fillStyle = '#b8bec8'; ctx.fillRect(0, 0, element.width, element.height)
    ctx.fillStyle = 'rgba(0, 0, 0, .08)'
    for (let x = -element.height; x < element.width; x += 10) { ctx.beginPath(); ctx.moveTo(x, element.height); ctx.lineTo(x + element.height, 0); ctx.lineTo(x + element.height + 3, 0); ctx.lineTo(x + 3, element.height); ctx.fill() }
    ctx.fillStyle = '#3b4250'; ctx.font = `700 ${Math.round(element.height * .42)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'
    ctx.fillText('بتراشید', element.width / 2, element.height / 2)
  }, [])
  function scratch(event: PointerEvent<HTMLCanvasElement>) {
    if (event.buttons !== 1 && event.pointerType === 'mouse') return
    const element = canvas.current, ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const rect = element.getBoundingClientRect(), x = (event.clientX - rect.left) * 2, y = (event.clientY - rect.top) * 2
    ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x, y, element.height * .42, 0, Math.PI * 2); ctx.fill()
    if (++strokes.current % 6) return
    const pixels = ctx.getImageData(0, 0, element.width, element.height).data
    let clear = 0
    for (let i = 3; i < pixels.length; i += 64) if (pixels[i] === 0) clear++
    if (clear / (pixels.length / 64) > .55) onDone()
  }
  return <span className={styles.scratch}>{children}<canvas ref={canvas} aria-hidden="true" onPointerDown={scratch} onPointerMove={scratch} /></span>
}

/**
 * The face of a delivery card (store/domain/card-designs): the product's design, the site's name and logo (or the
 * product's own), the product, then its rows by place: large (an amount), on the card, and the email part. Rows placed
 * beside the card are left to the caller. Every drawn text carries `data-draw` so the saved image matches it exactly.
 */
export default function CardFace({ design, brand, product, items, shown, face, photo, tilt = true, copied, onCopy, onReveal }: {
  design: CardDesign; brand: CardBrand; product: string; items: DeliveryItem[]; shown: boolean
  /** Another preset chosen by the viewer; the product's own design when unset. */ face?: string
  /** A photo from the viewer's own device (stays in the browser). */ photo?: string | null
  tilt?: boolean; copied?: string; onCopy?: (item: DeliveryItem, key: string) => void; onReveal?: () => void
}) {
  const preset = presetOf(face || design.preset)
  const own = !face, image = photo || (own ? design.background : '')
  const accent = (own && design.accent) || preset.accent
  const dark = !!image || !preset.light
  const ink = image ? '#ffffff' : preset.ink
  const frame = useRef<HTMLDivElement>(null)
  const [scratched, setScratched] = useState<Record<string, boolean>>({})
  const scratchMode = design.reveal === 'scratch' && !shown

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!tilt || event.pointerType !== 'mouse' || still()) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - .5, y = (event.clientY - rect.top) / rect.height - .5
    event.currentTarget.style.setProperty('--dc-rx', `${(-y * 7).toFixed(2)}deg`); event.currentTarget.style.setProperty('--dc-ry', `${(x * 9).toFixed(2)}deg`)
  }
  const leave = (event: PointerEvent<HTMLDivElement>) => { event.currentTarget.style.setProperty('--dc-rx', '0deg'); event.currentTarget.style.setProperty('--dc-ry', '0deg') }

  const groups = { hero: items.filter((item) => placeOf(item) === 'hero'), card: items.filter((item) => placeOf(item) === 'card'), email: items.filter((item) => placeOf(item) === 'email') }
  const row = (item: DeliveryItem, key: string, big = false) => {
    const hidden = item.secret && !shown && !scratched[key]
    const value = <button type="button" dir="ltr" className={big ? styles.heroValue : styles.value} data-draw data-value={item.value} aria-label={`کپی ${item.label}`} disabled={!onCopy} onClick={() => onCopy?.(item, key)}>
      {item.secret ? <Decode value={item.value} shown={!hidden} /> : item.value}
    </button>
    return <div key={key} className={big ? styles.hero : styles.row}>
      <dt data-draw>{item.label}</dt>
      <dd>
        {scratchMode && item.secret && !scratched[key] ? <Scratch onDone={() => { setScratched((current) => ({ ...current, [key]: true })); onReveal?.() }}>{value}</Scratch> : value}
        {copied === key && <span className={styles.copied} role="status">کپی شد</span>}
      </dd>
    </div>
  }
  const style = {
    '--dc-bg': preset.bg === 'site' ? 'color-mix(in srgb, var(--primary, #2563eb) 82%, #000)' : preset.bg,
    '--dc-ink': ink, '--dc-accent': accent,
    backgroundImage: [`url("${patternDataUrl(preset.pattern, dark ? '#ffffff' : '#000000')}")`, ...(image ? ['linear-gradient(rgb(10 12 18 / 46%), rgb(10 12 18 / 46%))', `url("${image}")`] : [])].join(', '),
  } as CSSProperties

  return <div ref={frame} className={styles.frame}>
    <div className={`${styles.face}${tilt ? ` ${styles.tilt}` : ''}`} style={style} data-card-face data-pattern={preset.pattern} data-dark={dark ? '1' : '0'} data-image={image || ''} onPointerMove={move} onPointerLeave={leave}>
      <div className={styles.head}>
        {(design.logo || brand.logo) && <img src={(own && design.logo) || brand.logo} alt="" className={styles.logo} data-draw-image />}
        <div className={styles.titles}>
          <b data-draw>{(own && design.title) || brand.title}</b>
          <span data-draw>{product}</span>
        </div>
      </div>
      <i className={styles.rule} aria-hidden="true" data-draw-fill />
      {groups.hero.length > 0 && <dl className={styles.heroes}>{groups.hero.map((item, index) => row(item, `hero-${index}`, true))}</dl>}
      {groups.card.length > 0 && <dl className={styles.rows}>{groups.card.map((item, index) => row(item, `card-${index}`))}</dl>}
      {groups.email.length > 0 && <div className={styles.email}>
        <span className={styles.emailTitle} data-draw>اطلاعات ایمیل</span>
        <dl className={styles.rows}>{groups.email.map((item, index) => row(item, `email-${index}`))}</dl>
      </div>}
      {preset.stripe && <div className={styles.stripe} aria-hidden="true">{preset.stripe.map((color) => <i key={color} style={{ background: color }} data-draw-fill />)}</div>}
    </div>
  </div>
}
