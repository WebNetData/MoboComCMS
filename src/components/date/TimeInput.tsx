'use client'

const pad = (n: number) => String(n).padStart(2, '0')
const fa = (n: number) => pad(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

export interface TimeInputProps {
  /** "HH:mm" (24-hour), the value a native time input holds; empty when unset. */
  value: string
  onChange: (value: string) => void
  /** Minute step shown in the list; a stored value off the step is still kept and shown. */
  step?: number
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/** A 24-hour time picked as hour : minute with Persian digits; the value stays "HH:mm" like a native time input. */
export default function TimeInput({ value, onChange, step = 5, disabled, className = 'input', ...aria }: TimeInputProps) {
  const [h, m] = /^\d{2}:\d{2}$/.test(value) ? value.split(':') : ['', '']
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step)
  if (m && !minutes.includes(Number(m))) { minutes.push(Number(m)); minutes.sort((a, b) => a - b) }
  const set = (hour: string, minute: string) => onChange(hour || minute ? `${hour || '00'}:${minute || '00'}` : '')
  return <span className={`${className} jtime`} role="group" aria-label={aria['aria-label']} aria-disabled={disabled || undefined}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
    <span className="jtime-clock" dir="ltr">
      <select className="jtime-part" aria-label="ساعت" value={h} disabled={disabled} onChange={(e) => set(e.target.value, m)}>{!h && <option value="">--</option>}{Array.from({ length: 24 }, (_, i) => <option key={i} value={pad(i)}>{fa(i)}</option>)}</select>
      <b aria-hidden="true">:</b>
      <select className="jtime-part" aria-label="دقیقه" value={m} disabled={disabled} onChange={(e) => set(h, e.target.value)}>{!m && <option value="">--</option>}{minutes.map((i) => <option key={i} value={pad(i)}>{fa(i)}</option>)}</select>
    </span>
  </span>
}
