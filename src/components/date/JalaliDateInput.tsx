'use client'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { JALALI_MONTHS, JALALI_WEEKDAYS, fromJalali, isoDay, jalaliDayLabel, jalaliMonthLength, parseIsoDay, toJalali } from '@/shared/time/jalali'

const fa = (n: number, width = 0) => String(n).padStart(width, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
const pad = (n: number) => String(n).padStart(2, '0')
/** Column of a UTC day in a week that starts on Saturday. */
const column = (date: Date) => (date.getUTCDay() + 1) % 7
const DAY = 86_400_000
/** Today on this device's own calendar, as a UTC day (what a native date input would call today). */
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` }
const localTime = () => { const now = new Date(); return `${pad(now.getHours())}:${pad(now.getMinutes())}` }

export interface JalaliDateInputProps {
  /** "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" with `withTime` — the same value a native date / datetime-local input holds. */
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /** Also choose the hour and minute (device time, like datetime-local). */
  withTime?: boolean
  id?: string
  /** Submitted with a <form> through a hidden input. */
  name?: string
  required?: boolean
  disabled?: boolean
  /** Earliest / latest selectable day, "YYYY-MM-DD". */
  min?: string
  max?: string
  placeholder?: string
  className?: string
  invalid?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
}

/** A date (and optionally time) picked on the Persian calendar; the value stays Gregorian like a native input's. */
export default function JalaliDateInput({ value, defaultValue = '', onChange, withTime = false, id, name, required, disabled, min, max, placeholder, className = 'input', invalid, ...aria }: JalaliDateInputProps) {
  const [own, setOwn] = useState(defaultValue)
  const current = value ?? own
  const day = current.slice(0, 10), time = /T(\d{2}:\d{2})/.exec(current)?.[1] || ''
  const picked = parseIsoDay(day)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const [focusDay, setFocusDay] = useState('')
  const start = toJalali(picked || parseIsoDay(localToday())!)
  const [view, setView] = useState({ jy: start.jy, jm: start.jm })
  const toggle = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), proxy = useRef<HTMLInputElement>(null)
  const panelId = useId()

  const commit = (next: string) => { if (value === undefined) setOwn(next); onChange?.(next) }
  const pickDay = (iso: string) => {
    if (!withTime) { commit(iso); close(true); return }
    commit(`${iso}T${time || localTime()}`)
    setFocusDay(iso)
  }
  const setTime = (hour: string, minute: string) => commit(`${day || localToday()}T${hour}:${minute}`)
  const close = (restore = false) => { setOpen(false); if (restore) toggle.current?.focus() }
  const openAt = (iso: string) => { const at = toJalali(parseIsoDay(iso)!); setView({ jy: at.jy, jm: at.jm }); setFocusDay(iso); setOpen(true) }
  const allowed = (iso: string) => (!min || iso >= min.slice(0, 10)) && (!max || iso <= max.slice(0, 10))

  // Placed under its field in the window, so a scrolling table or card never clips it.
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    const place = () => {
      const rect = toggle.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(316, window.innerWidth - 24), height = panel.current?.offsetHeight || 380
      const rtl = getComputedStyle(toggle.current!).direction === 'rtl'
      const left = Math.max(12, Math.min(rtl ? rect.right - width : rect.left, window.innerWidth - width - 12))
      const below = rect.bottom + 6, above = rect.top - 6 - height
      const top = below + height > window.innerHeight - 12 && above > 12 ? above : below
      setPosition({ left, top, width })
    }
    place()
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) place() }
    window.addEventListener('resize', place); window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => { const target = event.target as Node; if (!toggle.current?.contains(target) && !panel.current?.contains(target)) close() }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true) } }
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  useEffect(() => {
    const form = proxy.current?.form
    if (!form || value !== undefined) return
    const reset = () => setOwn(defaultValue)
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [value, defaultValue])
  useEffect(() => { if (open && position) panel.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus() }, [open, position, focusDay, view])

  const first = useMemo(() => fromJalali(view.jy, view.jm, 1), [view])
  const length = jalaliMonthLength(view.jy, view.jm)
  const move = (delta: number) => setView(({ jy, jm }) => { const at = jm + delta; return at < 1 ? { jy: jy - 1, jm: 12 } : at > 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: at } })
  const thisYear = toJalali(parseIsoDay(localToday())!).jy
  const years = useMemo(() => { const from = Math.min(thisYear - 100, view.jy), to = Math.max(thisYear + 15, view.jy); return Array.from({ length: to - from + 1 }, (_, i) => to - i) }, [thisYear, view.jy])
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: -1, ArrowLeft: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -30, PageDown: 30 }[event.key]
    const base = parseIsoDay(focusDay)
    if (step === undefined || !base) return
    event.preventDefault()
    // In a left-to-right page the horizontal arrows swap, as the week runs the other way.
    const dir = getComputedStyle(event.currentTarget).direction === 'rtl' || !event.key.startsWith('Arrow') || Math.abs(step) !== 1 ? step : -step
    const next = isoDay(new Date(base.getTime() + dir * DAY))
    const at = toJalali(parseIsoDay(next)!)
    setView({ jy: at.jy, jm: at.jm }); setFocusDay(next)
  }

  const label = day ? `${jalaliDayLabel(day)}${withTime && time ? ` · ساعت ${fa(Number(time.slice(0, 2)), 2)}:${fa(Number(time.slice(3)), 2)}` : ''}` : ''
  const today = localToday()
  return <span className="jdate">
    <button ref={toggle} type="button" id={id} className={`${className} jdate-toggle`} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-invalid={invalid || undefined} aria-label={aria['aria-label'] ? `${aria['aria-label']}${label ? `: ${label}` : ''}` : undefined} aria-describedby={[aria['aria-describedby'], `${panelId}-value`].filter(Boolean).join(' ')} onClick={() => (open ? close() : openAt(picked ? day : allowed(today) ? today : (min || max || today).slice(0, 10)))}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
      <span id={`${panelId}-value`} className={label ? 'jdate-value' : 'jdate-placeholder'}>{label || placeholder || (withTime ? 'انتخاب تاریخ و ساعت' : 'انتخاب تاریخ')}</span>
    </button>
    {(name || required) && <input ref={proxy} className="jdate-proxy" tabIndex={-1} aria-hidden="true" name={name} required={required} disabled={disabled} value={current} onChange={() => undefined} onInvalid={() => toggle.current?.focus()} />}
    {open && createPortal(<div ref={panel} id={panelId} className="jdate-panel" role="dialog" aria-label={withTime ? 'انتخاب تاریخ و ساعت شمسی' : 'انتخاب تاریخ شمسی'} dir="rtl" style={{ ...position, visibility: position ? 'visible' : 'hidden' }} onKeyDown={keys}>
      <header className="jdate-head">
        <button type="button" className="jdate-nav" onClick={() => move(-1)} aria-label="ماه قبل"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
        <span className="jdate-title">
          <select className="jdate-select" aria-label="ماه" value={view.jm} onChange={(e) => setView({ ...view, jm: Number(e.target.value) })}>{JALALI_MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select>
          <select className="jdate-select" aria-label="سال" value={view.jy} onChange={(e) => setView({ ...view, jy: Number(e.target.value) })}>{years.map((year) => <option key={year} value={year}>{fa(year)}</option>)}</select>
        </span>
        <button type="button" className="jdate-nav" onClick={() => move(1)} aria-label="ماه بعد"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
      </header>
      <div className="jdate-grid" role="group" aria-label={`${JALALI_MONTHS[view.jm - 1]} ${fa(view.jy)}`}>
        {JALALI_WEEKDAYS.map((name) => <span key={name} className="jdate-week" aria-hidden="true">{name}</span>)}
        {Array.from({ length: column(first) }, (_, index) => <span key={`pad-${index}`} aria-hidden="true" />)}
        {Array.from({ length }, (_, index) => {
          const iso = isoDay(new Date(first.getTime() + index * DAY)), ok = allowed(iso), isFocus = iso === (focusDay || day)
          return <button key={iso} type="button" data-day={iso} tabIndex={isFocus ? 0 : -1} disabled={!ok} className={`jdate-day${iso === day ? ' is-picked' : ''}${iso === today ? ' is-today' : ''}${column(new Date(first.getTime() + index * DAY)) === 6 ? ' is-friday' : ''}`} aria-pressed={iso === day} aria-label={jalaliDayLabel(iso, true)} onClick={() => pickDay(iso)}>{fa(index + 1)}</button>
        })}
      </div>
      {withTime && <div className="jdate-time">
        <span>ساعت</span>
        <span className="jdate-clock" dir="ltr">
          <select className="jdate-select" aria-label="ساعت" value={(time || localTime()).slice(0, 2)} onChange={(e) => setTime(e.target.value, (time || localTime()).slice(3))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={pad(h)}>{fa(h, 2)}</option>)}</select>
          <b aria-hidden="true">:</b>
          <select className="jdate-select" aria-label="دقیقه" value={(time || localTime()).slice(3)} onChange={(e) => setTime((time || localTime()).slice(0, 2), e.target.value)}>{Array.from({ length: 60 }, (_, m) => <option key={m} value={pad(m)}>{fa(m, 2)}</option>)}</select>
        </span>
      </div>}
      <footer className="jdate-foot">
        <button type="button" className="jdate-link" disabled={!allowed(today)} onClick={() => (withTime ? commit(`${today}T${localTime()}`) : pickDay(today))}>{withTime ? 'اکنون' : 'امروز'}</button>
        {!required && current && <button type="button" className="jdate-link is-muted" onClick={() => { commit(''); close(true) }}>پاک کردن</button>}
        {withTime && <button type="button" className="jdate-done" onClick={() => close(true)}>تأیید</button>}
      </footer>
    </div>, document.body)}
  </span>
}
