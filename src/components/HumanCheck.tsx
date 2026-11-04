'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import TurnstileWidget from '@/components/TurnstileWidget'
import { leadingZeroBits, proofInput, type HumanSurface } from '@/modules/identity/domain/human-check'
import { sha256Hex } from '@/shared/security/sha256'
import './human-check.css'

type Issued =
  | { provider: 'off' }
  | { provider: 'turnstile'; siteKey: string; action: 'login' | 'register' }
  | { provider: 'builtin'; challenge: string; bits: number; expiresAt: number; readyAt: number }

/** The value a form sends when no check is asked; the server accepts anything then. */
export const HUMAN_CHECK_OFF = 'off'

/** Finds the proof in small slices so the page stays responsive; resolves null when cancelled. */
function solve(challenge: string, bits: number, cancelled: () => boolean): Promise<string | null> {
  const salt = (() => { try { return JSON.parse(atob(challenge.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).r as string } catch { return '' } })()
  return new Promise((resolve) => {
    if (!salt) { resolve(null); return }
    let nonce = 0
    const step = () => {
      if (cancelled()) { resolve(null); return }
      const end = nonce + 512
      for (; nonce < end; nonce++) if (leadingZeroBits(sha256Hex(proofInput(salt, nonce))) >= bits) { resolve(`${challenge}.${nonce}`); return }
      setTimeout(step, 0)
    }
    step()
  })
}

/** Wait without retaining timers or callbacks after a form is removed. */
function waitUntil(at: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, Math.max(0, at - Date.now()))
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}

/**
 * The human check of a form (docs/specs/human-check/SPEC.md). Calls onToken with the value to send: a solved
 * proof, a Turnstile token, HUMAN_CHECK_OFF when the place is not protected, or '' while not ready.
 * Change resetKey after a refused or spent check to get a new one.
 */
export default function HumanCheck({ surface, locale = 'fa', resetKey = 0, onToken }: {
  surface: HumanSurface
  locale?: string
  resetKey?: number
  onToken: (token: string) => void
}) {
  const fa = locale === 'fa'
  const [issued, setIssued] = useState<Issued | null>(null)
  const [state, setState] = useState<'loading' | 'solving' | 'done' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const trap = useRef<HTMLInputElement>(null)
  const token = useRef('')

  useEffect(() => {
    let stop = false
    token.current = ''; onToken(''); setState('loading'); setIssued(null)
    const controller = new AbortController()
    fetch(`/api/human-check?surface=${surface}`, { cache: 'no-store', signal: controller.signal }).then((r) => r.ok ? r.json() as Promise<Issued> : Promise.reject(r.status)).then(async (next) => {
      if (stop) return
      setIssued(next)
      if (next.provider === 'off') { onToken(HUMAN_CHECK_OFF); setState('done'); return }
      if (next.provider === 'turnstile') { setState('done'); return }
      setState('solving')
      const proof = await solve(next.challenge, next.bits, () => stop)
      if (stop || !proof) return
      // Content checks wait for the server's minimum time before enabling submission.
      await waitUntil(next.readyAt, controller.signal)
      if (stop) return
      token.current = proof
      // A hidden field only robots fill: its value spoils the proof, so the server refuses it.
      onToken(trap.current?.value ? `${proof}.hp` : proof)
      setState('done')

    }).catch(() => { if (!stop) { setState('error'); onToken('') } })
    return () => { stop = true; controller.abort() }
  }, [surface, resetKey, attempt, onToken])

  // Long-lived forms renew before expiry, with a timer owned by this effect alone.
  useEffect(() => {
    if (issued?.provider !== 'builtin') return
    const timer = setTimeout(() => setAttempt(value => value + 1), Math.max(0, issued.expiresAt - Date.now() - 30_000))
    return () => clearTimeout(timer)
  }, [issued])

  const acceptToken = useCallback((value: string) => { token.current = value; onToken(value && trap.current?.value ? `${value}.hp` : value) }, [onToken])
  const onTrap = () => { if (token.current) onToken(`${token.current}.hp`) }

  let status: ReactNode = null
  if (issued?.provider === 'turnstile') status = <TurnstileWidget action={issued.action} locale={locale} resetKey={resetKey + attempt} onToken={acceptToken} />
  else if (state === 'error') status = <p className="hc-line is-error" role="alert">{fa ? 'بررسی امنیتی بارگیری نشد.' : 'The security check did not load.'} <button type="button" className="link-button" onClick={() => setAttempt((n) => n + 1)}>{fa ? 'دوباره' : 'Retry'}</button></p>
  else if (issued?.provider === 'builtin' || state === 'loading') status = <p className={`hc-line${state === 'done' ? ' is-done' : ''}`} aria-live="polite">
    <span className="hc-mark" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
    {state === 'done' ? (fa ? 'بررسی امنیتی انجام شد' : 'Security check passed') : (fa ? 'بررسی امنیتی…' : 'Checking…')}
  </p>

  return <div className="hc" data-surface={surface}>
    <label className="hc-trap" aria-hidden="true">Website<input ref={trap} type="text" name="mb_human_website" tabIndex={-1} autoComplete="off" onChange={onTrap} /></label>
    {status}
  </div>
}

/** For a form that sends JSON: the widget to place in it and the value to send as `humanCheck`. */
export function useHumanCheck(surface: HumanSurface, locale = 'fa') {
  const [token, setToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const reset = useCallback(() => { setToken(''); setResetKey((n) => n + 1) }, [])
  const widget = <HumanCheck surface={surface} locale={locale} resetKey={resetKey} onToken={setToken} />
  return { widget, token, ready: token !== '', reset }
}

/** True when an API answer says the human check was refused (the form should call reset()). */
export const humanCheckRefused = (data: unknown) => !!data && typeof data === 'object' && (data as { code?: unknown }).code === 'HUMAN_CHECK'
