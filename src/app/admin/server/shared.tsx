'use client'

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'
import { Notice, fa } from '../store/shared'
import Link from '@/components/AppLink'

export { Notice, fa, faDate } from '../store/shared'

const TABS: SectionTab[] = [
  { href: '/admin/server', label: 'وضعیت و سرویس‌ها', exact: true },
  { href: '/admin/server/engineering', label: 'مهندسی هوشمند' },
  { href: '/admin/server/files', label: 'مدیریت فایل' },
  { href: '/admin/server/gallery', label: 'گالری' },
  { href: '/admin/server/database', label: 'پایگاه داده' },
  { href: '/admin/updates', label: 'به‌روزرسانی امن' },
  { href: '/admin/server/downloads', label: 'مرکز دانلود' },
  { href: '/admin/server/domains', label: 'دامنه و SSL' },
  { href: '/admin/server/proxy', label: 'پروکسی Xray' },
  { href: '/admin/server/mail', label: 'ایمیل' },
  { href: '/admin/server/security', label: 'امنیت پنل' },
]

type Session = { unlocked: boolean; remainingMs: number; totp: boolean; ip: string; ipRestricted: boolean; unlockMinutes: number; root: string; appDir: string }
type Blocked = { code: 'disabled' | 'ip' | 'forbidden' | 'error'; message: string }

const PanelContext = createContext<{ session: Session; relock: () => void; refresh: () => Promise<void> } | null>(null)

export function usePanel() {
  const value = useContext(PanelContext)
  if (!value) throw new Error('usePanel outside ServerShell')
  return value
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number }

/** Fetch against the server-panel API; a 401 "locked" answer relocks the shell. */
export function useServerApi() {
  const { relock } = usePanel()
  return useCallback(async <T,>(url: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<ApiResult<T>> => {
    try {
      const response = await fetch(url, {
        method: init?.method || (init?.body || init?.form ? 'POST' : 'GET'),
        headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
        body: init?.form || (init?.body ? JSON.stringify(init.body) : undefined),
        cache: 'no-store',
      })
      const data = await response.json().catch(() => null)
      if (response.status === 401 && data?.code === 'locked') { relock(); return { ok: false, error: data.error, status: 401 } }
      return response.ok ? { ok: true, data: data as T } : { ok: false, error: String(data?.error || 'انجام نشد'), status: response.status }
    } catch { return { ok: false, error: 'ارتباط با سرور برقرار نشد', status: 0 } }
  }, [relock])
}

/** GET helper with reload. */
export function useServerJson<T>(url: string | null) {
  const api = useServerApi()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const reload = useCallback(async () => {
    if (!url) return
    setLoading(true)
    const result = await api<T>(url)
    setLoading(false)
    if (result.ok) { setData(result.data); setError('') } else setError(result.error)
  }, [api, url])
  useEffect(() => { void reload() }, [reload])
  return { data, error, loading, reload, setData }
}

function countdown(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${fa(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}`
}

function UnlockForm({ session, onDone }: { session: Session; onDone: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const response = await fetch('/api/admin/server/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, code }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'انجام نشد'); return }
    setPassword(''); setCode('')
    await onDone()
  }
  return <form className="sp-unlock sa-card" onSubmit={submit}>
    <div className="sp-unlock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></div>
    <h2>پنل سرور قفل است</h2>
    <p className="sa-hint">این بخش به کل سرور دسترسی دارد. برای ادامه رمز عبور حساب خود را دوباره وارد کنید{session.totp ? ' و کد دومرحله‌ای را از برنامهٔ احراز هویت بنویسید' : ''}. پنل پس از {fa(session.unlockMinutes)} دقیقه دوباره قفل می‌شود.</p>
    <label className="sa-field"><span>رمز عبور</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label>
    {session.totp && <label className="sa-field"><span>کد دومرحله‌ای</span><input className="input sp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9۰-۹ ]{6,7}" maxLength={7} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))} required /></label>}
    {error && <Notice tone="error">{error}</Notice>}
    <button type="submit" className="btn btn-primary" disabled={busy || !password}>{busy ? 'در حال بررسی…' : 'باز کردن پنل'}</button>
    <small className="sa-hint">IP شما: <bdi dir="ltr">{session.ip}</bdi>{session.ipRestricted ? ' — در فهرست مجاز است' : ''}</small>
  </form>
}

function BlockedView({ blocked }: { blocked: Blocked }) {
  return <section className="sa-card sp-blocked" role="alert">
    <h2>{blocked.code === 'disabled' ? 'پنل سرور خاموش است' : blocked.code === 'ip' ? 'دسترسی از این IP مجاز نیست' : 'دسترسی ممکن نیست'}</h2>
    <p>{blocked.message}</p>
    {blocked.code === 'disabled' && <>
      <p className="sa-hint">برای امنیت، این پنل تا وقتی مدیر سرور آن را روی خود سرور روشن نکند کار نمی‌کند. در ترمینال سرور یکی از این دو دستور را اجرا کنید (دومی پنل را فقط برای IP شما باز می‌کند و پیشنهاد می‌شود):</p>
      <pre className="sp-pre" dir="ltr">{'sudo mobocom panel on\nsudo mobocom panel on --ip YOUR.IP.ADDRESS'}</pre>
      <p className="sa-hint">برای دسترسی کامل به فایل‌های سرور، ایمیل دامنه و ری‌استارت سرویس‌ها، اسکریپت <code dir="ltr">deploy/ubuntu/server-panel-install.sh</code> را یک بار اجرا کنید.</p>
    </>}
  </section>
}

export function ServerShell({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [until, setUntil] = useState(0)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/server/session', { cache: 'no-store' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (!response?.ok) {
      setBlocked({ code: data?.code === 'disabled' ? 'disabled' : data?.code === 'ip' ? 'ip' : response?.status === 403 ? 'forbidden' : 'error', message: data?.error || 'ارتباط با سرور برقرار نشد' })
      return
    }
    setBlocked(null); setSession(data as Session); setUntil(Date.now() + (data as Session).remainingMs)
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!session?.unlocked) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session?.unlocked])
  const remaining = until - now
  useEffect(() => { if (session?.unlocked && remaining <= 0) setSession((current) => current && { ...current, unlocked: false }) }, [remaining, session?.unlocked])
  const relock = useCallback(() => setSession((current) => current && { ...current, unlocked: false }), [])

  async function lock() {
    await fetch('/api/admin/server/session', { method: 'DELETE' }).catch(() => null)
    relock()
  }

  const lockBar = session?.unlocked ? <div className="sp-lockbar">
    <span className="sa-state is-ok">باز · <span className="num">{countdown(remaining)}</span></span>
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void lock()}>قفل کن</button>
  </div> : null

  return <SectionShell tabs={TABS} label="بخش‌های پنل سرور" title={title} actions={<>{session?.unlocked && actions}{lockBar}</>}>
    {blocked ? <BlockedView blocked={blocked} />
      : !session ? <div className="sa-skeleton" aria-busy="true" />
        : !session.unlocked ? <UnlockForm session={session} onDone={refresh} />
          : <PanelContext.Provider value={{ session, relock, refresh }}>
            {!session.ipRestricted && <Notice tone="error">محدودیت IP تنظیم نشده است؛ هر کسی با این حساب از هر جایی می‌تواند وارد پنل سرور شود. <Link href="/admin/server/security" className="text-link">راهنمای تنظیم</Link></Notice>}
            {children}
          </PanelContext.Provider>}
  </SectionShell>
}

export function Meter({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const tone = pct >= 90 ? 'is-bad' : pct >= 75 ? 'is-warn' : 'is-ok'
  return <div className={`sp-meter ${tone}`}>
    <div className="sp-meter-head"><span>{label}</span><b className="num">{fa(Math.round(pct))}٪</b></div>
    <div className="sp-meter-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}><i style={{ inlineSize: `${pct}%` }} /></div>
    {detail && <small>{detail}</small>}
  </div>
}

export function bytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return '—'
  const units = ['بایت', 'KB', 'MB', 'GB', 'TB']
  let n = value, unit = 0
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++ }
  return `${(n >= 100 || unit === 0 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('fa-IR')} ${units[unit]}`
}

export function duration(seconds: number) {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60)
  return [d && `${fa(d)} روز`, h && `${fa(h)} ساعت`, !d && `${fa(m)} دقیقه`].filter(Boolean).join(' و ')
}
