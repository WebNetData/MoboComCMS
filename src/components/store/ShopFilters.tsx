'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'

/** A filter tick or choice applies at once (the form's button stays for typed prices and without script). */
export function FilterAutoApply({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const apply = (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.type === 'checkbox' || input.type === 'radio') form.requestSubmit()
    }
    form.addEventListener('change', apply)
    return () => form.removeEventListener('change', apply)
  }, [formId])
  return null
}

/** Narrows a long list of choices (brands, specification values) by what is typed. */
export function FacetFind({ target, label }: { target: string; label: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const list = document.getElementById(target)
    if (!list) return
    const needle = text.trim().toLowerCase()
    for (const item of Array.from(list.querySelectorAll<HTMLElement>('label'))) item.hidden = !!needle && !(item.textContent || '').toLowerCase().includes(needle)
  }, [target, text])
  return <input type="search" className="sx-facet-find" aria-label={label} placeholder={label} value={text} onChange={(e) => setText(e.target.value)} />
}

const faNum = (value: number) => value.toLocaleString('fa-IR')
const latin = (value: string) => Number(value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d.]/g, '')) || 0

/**
 * Two handles over the listed price range, kept in step with the "from" and "to" fields (which carry the values
 * the form sends). Letting go of a handle applies; an end left at its limit sends nothing.
 */
export function PriceSlider({ formId, min, max, from, to, unit }: { formId: string; min: number; max: number; from: number; to: number; unit: string }) {
  const step = Math.max(1, 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, max - min))) - 2))
  const [low, setLow] = useState(from > min ? Math.min(from, max) : min)
  const [high, setHigh] = useState(to && to < max ? Math.max(to, min) : max)
  // Typed text stays free while typing; it is read and kept within the range when the field is left.
  const [lowText, setLowText] = useState(low > min ? String(low) : '')
  const [highText, setHighText] = useState(high < max ? String(high) : '')
  const span = Math.max(1, max - min)
  const apply = () => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()
  const keys = (event: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) apply() }
  const moveLow = (value: number) => { const next = Math.max(min, Math.min(value, high)); setLow(next); setLowText(next > min ? String(next) : '') }
  const moveHigh = (value: number) => { const next = Math.min(max, Math.max(value, low)); setHigh(next); setHighText(next < max ? String(next) : '') }
  return <div className="sx-slider-price">
    <div className="sx-slider-track" style={{ ['--lo' as string]: `${((low - min) / span) * 100}%`, ['--hi' as string]: `${((high - min) / span) * 100}%` }}>
      <input type="range" min={min} max={max} step={step} value={low} aria-label="کمترین قیمت" aria-valuetext={`${faNum(low)} ${unit}`} onChange={(e) => moveLow(Number(e.target.value))} onPointerUp={apply} onKeyUp={keys} />
      <input type="range" min={min} max={max} step={step} value={high} aria-label="بیشترین قیمت" aria-valuetext={`${faNum(high)} ${unit}`} onChange={(e) => moveHigh(Number(e.target.value))} onPointerUp={apply} onKeyUp={keys} />
    </div>
    <div className="sx-range">
      <label><span>از</span><input name="min" inputMode="numeric" value={lowText} placeholder={faNum(min)} onChange={(e) => setLowText(e.target.value)} onBlur={() => moveLow(latin(lowText) || min)} /></label>
      <label><span>تا</span><input name="max" inputMode="numeric" value={highText} placeholder={faNum(max)} onChange={(e) => setHighText(e.target.value)} onBlur={() => moveHigh(latin(highText) || max)} /></label>
    </div>
  </div>
}
