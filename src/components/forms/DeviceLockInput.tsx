'use client'

import { useRef, useState, type PointerEvent } from 'react'
import { LOCK_KINDS, LOCK_LABEL, encodeDeviceLock, readDeviceLock, type DeviceLock, type LockKind } from '@/modules/forms/domain/forms'
import styles from './DeviceLockInput.module.css'

const DOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const at = (dot: number) => ({ x: ((dot - 1) % 3) * 50 + 25, y: Math.floor((dot - 1) / 3) * 50 + 25 })
const fa = (n: number) => n.toLocaleString('fa-IR')

/** Going straight from one dot over another (1 → 3 passes 2) takes the one between, as phones do. */
function between(from: number, to: number, used: number[]) {
  const a = at(from), b = at(to), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const dot = DOTS.find((n) => at(n).x === mid.x && at(n).y === mid.y)
  return dot && !used.includes(dot) ? dot : null
}

/**
 * A phone's lock (forms domain «devicelock»): no lock, a pattern drawn on the 3×3 grid (or tapped dot by dot, also
 * with the keyboard), a PIN, a password, or a pattern and a code. The value is encoded for the form and sealed with
 * the other secrets when it is sent.
 */
export default function DeviceLockInput({ value, onChange, id, invalid }: { value: string; onChange: (next: string) => void; id?: string; invalid?: boolean }) {
  const lock = readDeviceLock(value)
  const [shown, setShown] = useState(false)
  const drawing = useRef(false)
  // The pattern being drawn: pointer events arrive faster than the answer comes back as a prop.
  const drawn = useRef<number[]>([])
  const pad = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<DeviceLock>) => onChange(encodeDeviceLock({ ...lock, ...patch }))
  const add = (dot: number) => {
    const current = drawn.current
    if (current.includes(dot)) return
    const last = current[current.length - 1], mid = last ? between(last, dot, current) : null
    drawn.current = [...current, ...(mid ? [mid] : []), dot]
    set({ pattern: drawn.current })
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drawing.current) return
    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const dot = Number(element?.closest<HTMLElement>('[data-dot]')?.dataset.dot)
    if (dot) add(dot)
  }
  const pattern = lock.kind === 'pattern' || lock.kind === 'mixed', text = lock.kind === 'pin' || lock.kind === 'password' || lock.kind === 'mixed'

  return <div className={styles.lock} data-invalid={invalid ? '1' : undefined}>
    <div className={styles.kinds} role="radiogroup" aria-label="نوع قفل گوشی">
      {LOCK_KINDS.map((kind) => <button key={kind} type="button" role="radio" aria-checked={lock.kind === kind} className={styles.kind} onClick={() => onChange(encodeDeviceLock({ kind: kind as LockKind, pattern: kind === 'pattern' || kind === 'mixed' ? lock.pattern : [], text: kind === 'pin' ? lock.text.replace(/\D/g, '') : kind === 'none' || kind === 'pattern' ? '' : lock.text }))}>{LOCK_LABEL[kind]}</button>)}
    </div>
    {pattern && <div className={styles.patternRow}>
      <div ref={pad} className={styles.pad} onPointerMove={move} onPointerUp={() => { drawing.current = false }} onPointerLeave={() => { drawing.current = false }} role="group" aria-label="الگو: نقطه‌ها را به ترتیب بکشید یا بزنید">
        <svg viewBox="0 0 150 150" aria-hidden="true">{lock.pattern.slice(1).map((dot, index) => { const a = at(lock.pattern[index]), b = at(dot); return <line key={`${index}-${dot}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}</svg>
        {DOTS.map((dot) => { const order = lock.pattern.indexOf(dot); return <button key={dot} type="button" data-dot={dot} className={styles.dot} aria-pressed={order >= 0} aria-label={`نقطهٔ ${fa(dot)}${order >= 0 ? `، ${fa(order + 1)}مین` : ''}`}
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.releasePointerCapture?.(event.pointerId); drawing.current = true; drawn.current = []; add(dot) }}
          onClick={(event) => { if (event.detail === 0) { drawn.current = lock.pattern; add(dot) } }}>
          <i>{order >= 0 ? fa(order + 1) : ''}</i>
        </button> })}
      </div>
      <div className={styles.patternSide}>
        <span dir="ltr" className={styles.sequence}>{lock.pattern.length ? lock.pattern.join(' → ') : '—'}</span>
        <small>{lock.pattern.length ? `${fa(lock.pattern.length)} نقطه` : 'از نقطهٔ شروع بکشید؛ دست‌کم ۴ نقطه'}</small>
        <button type="button" className={styles.clear} disabled={!lock.pattern.length} onClick={() => { drawn.current = []; set({ pattern: [] }) }}>پاک کردن الگو</button>
      </div>
    </div>}
    {text && <div className={styles.textRow}>
      <input id={id} className="input" dir="ltr" autoComplete="off" spellCheck={false} type={shown ? 'text' : 'password'} inputMode={lock.kind === 'pin' ? 'numeric' : 'text'} maxLength={lock.kind === 'pin' ? 16 : 64}
        aria-label={lock.kind === 'pin' ? 'پین گوشی' : 'رمز گوشی'} placeholder={lock.kind === 'pin' ? 'پین (فقط عدد)' : 'رمز گوشی'} value={lock.text}
        onChange={(event) => set({ text: lock.kind === 'pin' ? event.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '') : event.target.value })} />
      <button type="button" className={styles.clear} aria-pressed={shown} onClick={() => setShown((value) => !value)}>{shown ? 'پنهان' : 'نمایش'}</button>
    </div>}
  </div>
}
