'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import { StoreIcon } from '@/components/store/StoreIcons'

type FilterResetMode = 'cancel' | 'clear'
const FILTER_RESET_EVENT = 'sx-filter-reset'
const PRICE_STEP_EVENT = 'sx-filter-price-step'

function resetFilterChildren(form: HTMLFormElement | null, mode: FilterResetMode) {
  if (!form) return
  if (mode === 'cancel') form.reset()
  form.dispatchEvent(new CustomEvent(FILTER_RESET_EVENT, { detail: { mode } }))
}

function closeFilterDialog(dialog: HTMLDialogElement | null) {
  if (!dialog) return
  resetFilterChildren(dialog.querySelector<HTMLFormElement>('form'), 'cancel')
  dialog.close()
}

function openFilterDialog(dialogId: string) {
  const dialog = document.getElementById(dialogId)
  if (!(dialog instanceof HTMLDialogElement) || dialog.matches(':modal')) return
  if (dialog.open) dialog.close()
  dialog.showModal()
  dialog.querySelector<HTMLElement>('[data-filter-dialog-focus]')?.focus({ preventScroll: true })
}

/** One server-rendered filter form acts as the desktop sidebar and mobile modal. */
export function ShopFilterDialog({ id, formId, children }: { id: string; formId: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    document.documentElement.classList.add('sx-filter-dialog-ready')
    const mobile = window.matchMedia('(max-width: 900px)')
    const matchViewport = () => {
      if (dialog.open) closeFilterDialog(dialog)
      if (!mobile.matches) dialog.show()
    }
    matchViewport()
    mobile.addEventListener('change', matchViewport)
    const pageshow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      resetFilterChildren(dialog.querySelector<HTMLFormElement>(`#${formId}`), 'cancel')
      if (dialog.matches(':modal')) dialog.close()
    }
    window.addEventListener('pageshow', pageshow)
    return () => {
      window.removeEventListener('pageshow', pageshow)
      mobile.removeEventListener('change', matchViewport)
      document.documentElement.classList.remove('sx-filter-dialog-ready')
    }
  }, [formId])

  const discardDraft = () => {
    if (!ref.current?.open) resetFilterChildren(ref.current?.querySelector<HTMLFormElement>(`#${formId}`) || null, 'cancel')
  }
  const close = () => closeFilterDialog(ref.current)
  return <dialog ref={ref} id={id} className="sx-filters" open aria-labelledby={`${id}-title`}
    onSubmitCapture={(event) => {
      if (!(event.target instanceof HTMLFormElement) || event.target.id !== formId) return
      event.preventDefault()
      const query = new URLSearchParams()
      for (const [key, value] of new FormData(event.target)) if (typeof value === 'string' && value) query.append(key, value)
      // The URL remains the applied state; client navigation avoids native history restoring stale form controls.
      router.push(`/products?${query}`)
      if (ref.current?.matches(':modal')) close()
    }}
    onCancel={(event) => { event.preventDefault(); close() }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || !event.currentTarget.matches(':modal')) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
    }}
    onClose={discardDraft}>
    {children}
  </dialog>
}

/** The mobile trigger opens the same filter panel that remains a desktop sidebar. */
export function ShopFilterTrigger({ dialogId, count }: { dialogId: string; count: number }) {
  return <button type="button" className="sx-btn sx-filters-open" aria-haspopup="dialog" aria-controls={dialogId} onClick={() => openFilterDialog(dialogId)}>
    <StoreIcon name="filter" size={16} /><span>فیلترها</span>{count > 0 && <span className="num">{count.toLocaleString('fa-IR')}</span>}
  </button>
}

export function FilterDialogClose({ dialogId }: { dialogId: string }) {
  return <button type="button" className="sx-filters-close" aria-label="بستن فیلترها" data-filter-dialog-focus onClick={() => {
    const dialog = document.getElementById(dialogId)
    if (dialog instanceof HTMLDialogElement) closeFilterDialog(dialog)
  }}><StoreIcon name="x" size={20} /></button>
}

/** Clears refinements in the mobile draft while retaining the applied route context. */
export function ClearFilterDraft({ formId }: { formId: string }) {
  const clear = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => { input.checked = false })
    form.querySelectorAll<HTMLInputElement>('input[type="radio"][name="rating"]').forEach((input) => { input.checked = input.value === '' })
    form.querySelectorAll<HTMLInputElement>('input[type="radio"][name="kind"]').forEach((input) => { input.checked = input.defaultChecked })
    form.querySelectorAll<HTMLInputElement>('input[name="min"], input[name="max"]').forEach((input) => { input.value = '' })
    form.dispatchEvent(new CustomEvent(FILTER_RESET_EVENT, { detail: { mode: 'clear' satisfies FilterResetMode } }))
  }
  return <button type="button" className="sx-filter-clear-draft" onClick={clear}>پاک‌کردن فیلترها</button>
}

/** Desktop filter choices apply at once; mobile modal choices remain draft until the form is submitted. */
export function FilterAutoApply({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const apply = (event: Event) => {
      const input = event.target as HTMLInputElement
      if ((input.type === 'checkbox' || input.type === 'radio') && !form.closest('dialog')?.matches(':modal')) form.requestSubmit()
    }
    const selectPriceStep = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !form.closest('dialog')?.matches(':modal')) return
      const link = target.closest<HTMLAnchorElement>('[data-filter-price-step]')
      if (!link) return
      event.preventDefault()
      const url = new URL(link.href, window.location.href)
      const min = Number(url.searchParams.get('min')) || 0, max = Number(url.searchParams.get('max')) || 0
      for (const [name, value] of [['min', min], ['max', max]] as const) {
        const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`)
        if (input) input.value = value ? String(value) : ''
      }
      form.dispatchEvent(new CustomEvent(PRICE_STEP_EVENT, { detail: { min, max } }))
    }
    form.addEventListener('change', apply)
    form.addEventListener('click', selectPriceStep)
    return () => { form.removeEventListener('change', apply); form.removeEventListener('click', selectPriceStep) }
  }, [formId])
  return null
}

/** Narrows a long list of choices (brands, specification values) by what is typed. */
export function FacetFind({ target, label, formId }: { target: string; label: string; formId: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const list = document.getElementById(target)
    if (!list) return
    const needle = text.trim().toLowerCase()
    for (const item of Array.from(list.querySelectorAll<HTMLElement>('label'))) item.hidden = !!needle && !(item.textContent || '').toLowerCase().includes(needle)
  }, [target, text])
  useEffect(() => {
    const form = document.getElementById(formId)
    if (!form) return
    const reset = () => setText('')
    form.addEventListener(FILTER_RESET_EVENT, reset)
    return () => form.removeEventListener(FILTER_RESET_EVENT, reset)
  }, [formId])
  return <input type="search" className="sx-facet-find" aria-label={label} placeholder={label} value={text} onChange={(e) => setText(e.target.value)} />
}

const faNum = (value: number) => value.toLocaleString('fa-IR')
const latin = (value: string) => Number(value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d.]/g, '')) || 0

/**
 * Two handles over the listed price range, kept in step with the "from" and "to" fields (which carry the values
 * the form sends). Desktop changes apply on release; mobile modal changes wait for Apply.
 */
export function PriceSlider({ formId, min, max, from, to, unit }: { formId: string; min: number; max: number; from: number; to: number; unit: string }) {
  const step = Math.max(1, 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, max - min))) - 2))
  const [low, setLow] = useState(from > min ? Math.min(from, max) : min)
  const [high, setHigh] = useState(to && to < max ? Math.max(to, min) : max)
  // Typed text stays free while typing; it is read and kept within the range when the field is left.
  const [lowText, setLowText] = useState(low > min ? String(low) : '')
  const [highText, setHighText] = useState(high < max ? String(high) : '')
  const span = Math.max(1, max - min)
  const apply = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (form && !form.closest('dialog')?.matches(':modal')) form.requestSubmit()
  }
  const keys = (event: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) apply() }
  const moveLow = (value: number) => { const next = Math.max(min, Math.min(value, high)); setLow(next); setLowText(next > min ? String(next) : '') }
  const moveHigh = (value: number) => { const next = Math.min(max, Math.max(value, low)); setHigh(next); setHighText(next < max ? String(next) : '') }
  useEffect(() => {
    const form = document.getElementById(formId)
    if (!form) return
    const reset = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: FilterResetMode }>).detail?.mode
      const nextLow = mode === 'clear' ? min : from > min ? Math.min(from, max) : min
      const nextHigh = mode === 'clear' ? max : to && to < max ? Math.max(to, min) : max
      setLow(nextLow); setHigh(nextHigh); setLowText(nextLow > min ? String(nextLow) : ''); setHighText(nextHigh < max ? String(nextHigh) : '')
    }
    const priceStep = (event: Event) => {
      const detail = (event as CustomEvent<{ min: number; max: number }>).detail
      if (!detail) return
      const nextLow = detail.min > min ? Math.min(detail.min, max) : min
      const nextHigh = detail.max && detail.max < max ? Math.max(detail.max, min) : max
      setLow(nextLow); setHigh(nextHigh); setLowText(nextLow > min ? String(nextLow) : ''); setHighText(nextHigh < max ? String(nextHigh) : '')
    }
    form.addEventListener(FILTER_RESET_EVENT, reset)
    form.addEventListener(PRICE_STEP_EVENT, priceStep)
    return () => { form.removeEventListener(FILTER_RESET_EVENT, reset); form.removeEventListener(PRICE_STEP_EVENT, priceStep) }
  }, [formId, min, max, from, to])
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
