'use client'

import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

const toLatin = (value: string) => value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '')

type Props = {
  value: string
  onChange: (value: string) => void
  /** Called once all digits are in. */
  onComplete?: (value: string) => void
  length?: number
  disabled?: boolean
  invalid?: boolean
  label: string
  autoFocus?: boolean
}

/**
 * A one-time code typed into separate boxes: typing moves forward, Backspace moves back,
 * pasting or the phone's SMS autofill spreads the whole code. Persian digits are accepted.
 */
export default function OtpCodeInput({ value, onChange, onComplete, length = 6, disabled, invalid, label, autoFocus }: Props) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  // Focus moves before React re-renders, so the focus guard reads the newest code from here.
  const latest = useRef(value)
  useLayoutEffect(() => { latest.current = value }, [value])
  const digits = Array.from({ length }, (_, index) => value[index] || '')

  useEffect(() => { if (autoFocus) boxes.current[0]?.focus() }, [autoFocus])

  function commit(next: string, focusAt?: number) {
    const clean = toLatin(next).slice(0, length)
    latest.current = clean
    onChange(clean)
    if (focusAt != null) boxes.current[Math.min(focusAt, length - 1)]?.focus()
    if (clean.length === length) onComplete?.(clean)
  }

  function type(index: number, raw: string) {
    const code = latest.current
    let typed = toLatin(raw)
    if (!typed) return
    // A digit typed after the one already in the box replaces it.
    if (code[index] && typed.length === 2 && typed.startsWith(code[index])) typed = typed.slice(1)
    // Autofill or a fast typist can deliver several digits into one box.
    if (typed.length > 1) { commit(code.slice(0, index) + typed, index + typed.length); return }
    const chars = Array.from({ length }, (_, at) => code[at] || '')
    chars[index] = typed
    commit(chars.join('').slice(0, length), index + 1)
  }

  function key(index: number, event: KeyboardEvent<HTMLInputElement>) {
    const code = latest.current
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (code[index]) commit(code.slice(0, index) + code.slice(index + 1), index)
      else if (index > 0) commit(code.slice(0, index - 1) + code.slice(index), index - 1)
    }
    // The code reads left to right even on a right-to-left page.
    if (event.key === 'ArrowLeft') { event.preventDefault(); boxes.current[Math.max(0, index - 1)]?.focus() }
    if (event.key === 'ArrowRight') { event.preventDefault(); boxes.current[Math.min(length - 1, index + 1)]?.focus() }
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = toLatin(event.clipboardData.getData('text'))
    if (!pasted) return
    event.preventDefault()
    commit(pasted, pasted.length)
  }

  return <div className={`otp-boxes${invalid ? ' is-invalid' : ''}`} dir="ltr" role="group" aria-label={label}>
    {digits.map((digit, index) => <input
      key={index}
      ref={(node) => { boxes.current[index] = node }}
      className={`otp-box${digit ? ' is-filled' : ''}`}
      inputMode="numeric"
      autoComplete={index === 0 ? 'one-time-code' : 'off'}
      pattern="[0-9]*"
      maxLength={index === 0 ? length : 1}
      value={digit}
      disabled={disabled}
      aria-label={`رقم ${(index + 1).toLocaleString('fa-IR')} از ${length.toLocaleString('fa-IR')}`}
      aria-invalid={invalid || undefined}
      onChange={(event) => type(index, event.target.value)}
      onKeyDown={(event) => key(index, event)}
      onPaste={paste}
      // Digits fill in order: an empty box further along hands focus back to the next one due.
      onFocus={(event) => { const filled = latest.current.length; if (index > filled) boxes.current[filled]?.focus(); else event.target.select() }}
    />)}
  </div>
}
