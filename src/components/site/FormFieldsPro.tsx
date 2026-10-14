'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { JALALI_MONTHS, fromJalali, jalaliMonthLength, toJalali } from '@/modules/games/domain/games'
import type { FormField } from '@/modules/forms/domain/forms'

const fa = (n: number) => n.toLocaleString('fa-IR', { useGrouping: false })
const iso = (date: Date) => date.toISOString().slice(0, 10)
const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
/** Column of a UTC day in a week that starts on Saturday. */
const column = (date: Date) => (date.getUTCDay() + 1) % 7
export const jalaliLabel = (value: string, weekday = false) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', ...(weekday ? { weekday: 'long' } : {}) }).format(date) : ''
}

/** A date chosen on the Persian calendar; the answer stays a Gregorian day (YYYY-MM-DD) like every other date. */
export function JalaliDatePicker({ id, value, onChange, invalid, describedBy }: { id: string; value: string; onChange: (value: string) => void; invalid?: boolean; describedBy?: string }) {
  const [open, setOpen] = useState(false)
  const today = useMemo(() => new Date(`${iso(new Date())}T00:00:00Z`), [])
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null
  const start = toJalali(picked || today)
  const [view, setView] = useState({ jy: start.jy, jm: start.jm })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [open])
  const first = fromJalali(view.jy, view.jm, 1)
  const days = jalaliMonthLength(view.jy, view.jm)
  const move = (delta: number) => setView(({ jy, jm }) => { const at = jm + delta; return at < 1 ? { jy: jy - 1, jm: 12 } : at > 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: at } })
  return <div className="pf-jdate" ref={box}>
    <button type="button" id={id} className="input pf-jdate-toggle" aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid || undefined} aria-describedby={describedBy} onClick={() => setOpen(!open)}>
      <span>{jalaliLabel(value) || 'انتخاب تاریخ'}</span><i aria-hidden="true">▾</i>
    </button>
    {open && <div className="pf-cal" role="dialog" aria-label="تقویم شمسی">
      <header>
        <button type="button" onClick={() => move(-1)} aria-label="ماه قبل">‹</button>
        <b>{JALALI_MONTHS[view.jm - 1]} {fa(view.jy)}</b>
        <button type="button" onClick={() => move(1)} aria-label="ماه بعد">›</button>
      </header>
      <div className="pf-cal-grid" role="grid">
        {WEEK.map((name) => <span key={name} className="pf-cal-week" aria-hidden="true">{name}</span>)}
        {Array.from({ length: column(first) }, (_, index) => <span key={`pad-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const date = new Date(first.getTime() + index * 86_400_000), key = iso(date)
          return <button key={key} type="button" className={`${key === value ? 'is-picked' : ''}${key === iso(today) ? ' is-today' : ''}`} aria-pressed={key === value} aria-label={jalaliLabel(key, true)} onClick={() => { onChange(key); setOpen(false) }}>{fa(index + 1)}</button>
        })}
      </div>
      <footer><button type="button" className="text-link" onClick={() => { onChange(iso(today)); setOpen(false) }}>امروز</button>{value && <button type="button" className="text-link" onClick={() => { onChange(''); setOpen(false) }}>پاک کردن</button>}</footer>
    </div>}
  </div>
}

type Turns = { days: string[]; date: string; times: { time: string; left: number }[] }

/** A turn: a day from the open ones, then an hour that still has room. The answer is "YYYY-MM-DD HH:MM". */
export function SlotPicker({ slug, field, value, onChange, preview }: { slug: string; field: FormField; value: string; onChange: (value: string) => void; preview?: boolean }) {
  const [day, setDay] = useState(value.slice(0, 10))
  const [data, setData] = useState<Turns | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => {
    if (preview) { setNote('در پیش‌نمایش، روزها و ساعت‌های باز پس از انتشار فرم نشان داده می‌شوند.'); return }
    let live = true
    setNote('')
    void fetch(`/api/forms/${slug}/slots?field=${encodeURIComponent(field.id)}&date=${day}`, { cache: 'no-store' })
      .then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => null) }))
      .then(({ ok, body }) => { if (!live) return; if (ok) setData(body); else setNote(String(body?.error || 'نوبت‌ها بارگذاری نشد')) })
      .catch(() => { if (live) setNote('ارتباط برقرار نشد') })
    return () => { live = false }
  }, [slug, field.id, day, preview])
  const chip = (date: string) => { const d = new Date(`${date}T00:00:00Z`); const p = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d); const get = (type: string) => p.find((part) => part.type === type)?.value || ''; return { week: get('weekday'), day: get('day'), month: get('month') } }
  return <div className="pf-slot">
    {note && <p className="pf-help" role="status">{note}</p>}
    {data && !data.days.length && <p className="pf-help">در حال حاضر روز بازی برای نوبت‌گیری نیست.</p>}
    {data && data.days.length > 0 && <div className="pf-slot-days" role="radiogroup" aria-label="روز">
      {data.days.map((date) => { const c = chip(date); return <button key={date} type="button" role="radio" aria-checked={day === date} className={day === date ? 'is-on' : ''} onClick={() => { setDay(date); onChange('') }}><small>{c.week}</small><b>{c.day}</b><small>{c.month}</small></button> })}
    </div>}
    {data && day && data.date === day && <div className="pf-slot-times" role="radiogroup" aria-label="ساعت">
      {data.times.map((turn) => <button key={turn.time} type="button" role="radio" aria-checked={value === `${day} ${turn.time}`} disabled={turn.left <= 0} className={value === `${day} ${turn.time}` ? 'is-on' : ''} onClick={() => onChange(`${day} ${turn.time}`)}>
        <b className="num" dir="ltr">{turn.time}</b><small>{turn.left <= 0 ? 'پر شد' : (field.slot?.capacity || 1) > 1 ? `${fa(turn.left)} جای خالی` : 'آزاد'}</small>
      </button>)}
      {!data.times.length && <p className="pf-help">برای این روز ساعت آزادی نمانده است.</p>}
    </div>}
    {value && <p className="pf-slot-picked" role="status">نوبت شما: <b>{jalaliLabel(value.slice(0, 10), true)}</b> ساعت <b className="num" dir="ltr">{value.slice(11)}</b></p>}
  </div>
}

/** Rows the visitor adds, each with the same columns (work history, items of an order, people coming along). */
export function Repeater({ field, value, onChange }: { field: FormField; value: string[]; onChange: (rows: string[]) => void }) {
  const columns = field.columns || []
  const blank = () => columns.map(() => '')
  const [rows, setRows] = useState<string[][]>(() => (value.length ? value.map((row) => { const cells = row.split(' | '); return columns.map((_, index) => cells[index] || '') }) : [blank()]))
  const emit = (next: string[][]) => { setRows(next); onChange(next.filter((cells) => cells.some((cell) => cell.trim())).map((cells) => cells.map((cell) => cell.replace(/\|/g, '/').trim()).join(' | '))) }
  const max = field.max || 10
  return <div className="pf-rep">
    <div className="pf-rep-rows">
      {rows.map((cells, at) => <div key={at} className="pf-rep-row" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) auto` }}>
        {columns.map((title, index) => <label key={index}><span>{title}</span><input className="input" maxLength={200} value={cells[index]} onChange={(event) => emit(rows.map((row, i) => (i === at ? row.map((cell, j) => (j === index ? event.target.value : cell)) : row)))} /></label>)}
        <button type="button" className="pf-rep-remove" aria-label={`حذف ردیف ${at + 1}`} disabled={rows.length <= 1} onClick={() => emit(rows.filter((_, i) => i !== at))}>×</button>
      </div>)}
    </div>
    {rows.length < max && <button type="button" className="btn btn-ghost pf-rep-add" onClick={() => emit([...rows, blank()])}>+ افزودن ردیف</button>}
  </div>
}

/** A signature drawn with the mouse or a finger; kept as a picture attached to the answer. */
export function SignaturePad({ signed, busy, onSave, onClear }: { signed: boolean; busy: boolean; onSave: (file: File) => void; onClear: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const el = canvas.current!, box = el.getBoundingClientRect(); return { x: (event.clientX - box.left) * (el.width / box.width), y: (event.clientY - box.top) * (el.height / box.height) } }
  const context = () => { const ctx = canvas.current!.getContext('2d')!; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827'; return ctx }
  const clear = () => { const el = canvas.current; if (el) el.getContext('2d')!.clearRect(0, 0, el.width, el.height); setDirty(false); onClear() }
  const save = () => {
    const el = canvas.current
    if (!el) return
    // On a white ground, so the picture reads on any page.
    const out = document.createElement('canvas'); out.width = el.width; out.height = el.height
    const ctx = out.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(el, 0, 0)
    out.toBlob((blob) => { if (blob) onSave(new File([blob], 'signature.png', { type: 'image/png' })) }, 'image/png')
  }
  return <div className={`pf-sign${signed ? ' is-signed' : ''}`}>
    <canvas ref={canvas} width={640} height={200} aria-label="محل امضا" style={{ touchAction: 'none' }}
      onPointerDown={(event) => { if (signed) return; event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; const p = point(event), ctx = context(); ctx.beginPath(); ctx.moveTo(p.x, p.y) }}
      onPointerMove={(event) => { if (!drawing.current) return; const p = point(event), ctx = context(); ctx.lineTo(p.x, p.y); ctx.stroke(); if (!dirty) setDirty(true) }}
      onPointerUp={() => { drawing.current = false }} onPointerLeave={() => { drawing.current = false }} />
    <div className="pf-sign-actions">
      {signed ? <span className="pf-sign-done" role="status">✓ امضا ثبت شد</span> : <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'در حال ثبت…' : 'تأیید امضا'}</button>}
      <button type="button" className="btn btn-ghost" disabled={busy || (!dirty && !signed)} onClick={clear}>{signed ? 'امضای دوباره' : 'پاک کردن'}</button>
      {!signed && <small className="pf-help">با ماوس یا انگشت در کادر بالا امضا کنید.</small>}
    </div>
  </div>
}
