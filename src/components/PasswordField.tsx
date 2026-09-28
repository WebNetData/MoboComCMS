'use client'

import { useState } from 'react'

/** Rough strength for the meter only; the server enforces the real rules. */
function strength(value: string) {
  if (!value) return 0
  let score = value.length >= 8 ? 1 : 0
  if (value.length >= 12) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++
  return Math.min(4, score)
}

const LABELS = ['خیلی کوتاه', 'ضعیف', 'متوسط', 'خوب', 'قوی']

export default function PasswordField({ id, label, value, onChange, autoComplete = 'new-password', meter = true }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete?: string; meter?: boolean }) {
  const [shown, setShown] = useState(false)
  const level = strength(value)
  return <div className="mb-4 pw-field">
    <label className="label" htmlFor={id}>{label}</label>
    <div className="pw-input">
      <input id={id} className="input" type={shown ? 'text' : 'password'} autoComplete={autoComplete} dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} required minLength={8} maxLength={128} aria-describedby={meter ? `${id}-meter` : undefined} />
      <button type="button" className="pw-toggle" onClick={() => setShown(!shown)} aria-pressed={shown} aria-label={shown ? 'پنهان کردن رمز' : 'نمایش رمز'}>{shown ? 'پنهان' : 'نمایش'}</button>
    </div>
    {meter && <div className="pw-meter" id={`${id}-meter`} data-level={level} aria-live="polite">
      <span aria-hidden="true"><i /><i /><i /><i /></span>
      <small>{value ? `قدرت رمز: ${LABELS[level]}` : 'دست‌کم ۸ کاراکتر؛ ترکیب حروف، عدد و نماد بهتر است.'}</small>
    </div>}
  </div>
}
