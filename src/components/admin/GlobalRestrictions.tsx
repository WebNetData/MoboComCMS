'use client'

import { useCallback, useEffect, useId, useReducer, useRef, type FormEvent } from 'react'
import styles from './GlobalRestrictions.module.css'
import JalaliDateInput from '@/components/date/JalaliDateInput'

type Row = { id: number; reason: string; startsAt: string; expiresAt: string | null; issuedAt: string; issuedByUserId: number | null; revokedAt: string | null; revocationReason: string; revokedByUserId: number | null }
type State = { phase: 'loading' | 'ready' | 'saving' | 'forbidden' | 'error'; rows: Row[]; nextBefore: number | null; canIssue: boolean; loadedAt: number; revokeId: number | null; error: string; message: string }
type Action = { type: 'pending'; phase: 'loading' | 'saving' } | { type: 'loaded'; data: { rows: Row[]; nextBefore: number | null; canIssue: boolean }; append: boolean; message: string; at: number } | { type: 'failed'; error: string; forbidden?: boolean } | { type: 'revoke'; id: number | null }
const initial: State = { phase: 'loading', rows: [], nextBefore: null, canIssue: false, loadedAt: 0, revokeId: null, error: '', message: '' }
function reducer(state: State, action: Action): State {
  if (action.type === 'pending') return { ...state, phase: action.phase, error: '', message: '' }
  if (action.type === 'revoke') return { ...state, revokeId: action.id, error: '', message: '' }
  if (action.type === 'failed') return { ...state, phase: action.forbidden ? 'forbidden' : 'error', error: action.error, ...(action.forbidden ? { rows: [], canIssue: false, revokeId: null } : {}) }
  const rows = action.append ? [...state.rows, ...action.data.rows.filter(row => !state.rows.some(old => old.id === row.id))] : action.data.rows
  return { ...state, ...action.data, rows, phase: 'ready', loadedAt: action.at, revokeId: null, error: '', message: action.message }
}
const date = (value: string) => new Date(value).toLocaleString('fa-IR')

/** Presentation only: current permission, staff protection and record claims are enforced by Identity. */
export default function GlobalRestrictions({ userId }: { userId: number }) {
  const [state, dispatch] = useReducer(reducer, initial), prefix = useId(), feedback = useRef<HTMLParagraphElement>(null)
  const endpoint = `/api/admin/users/${userId}/restrictions`
  const load = useCallback(async (signal?: AbortSignal, before?: number, message = '') => {
    try {
      const response = await fetch(`${endpoint}${before ? `?before=${before}` : ''}`, { signal, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) { dispatch({ type: 'failed', forbidden: response.status === 403, error: `${message ? `${message} ` : ''}${response.status === 403 ? 'برای مدیریت محدودیت این حساب دسترسی ندارید.' : String(data.error || 'بازخوانی انجام نشد؛ دوباره تلاش کنید.')}` }); return }
      if (!Array.isArray(data.rows)) throw new Error('پاسخ تاریخچه معتبر نیست؛ دوباره تلاش کنید.')
      dispatch({ type: 'loaded', data, append: before !== undefined, message, at: Date.now() })
    } catch (error) {
      if (!signal?.aborted) dispatch({ type: 'failed', error: `${message ? `${message} ` : ''}بازخوانی انجام نشد؛ اتصال را بررسی و دوباره بازخوانی کنید.` })
    }
  }, [endpoint])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  const ready = state.phase === 'ready', busy = state.phase === 'saving' || state.phase === 'loading'
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready) return
    const form = event.currentTarget, values = new FormData(form), action = values.get('action')
    dispatch({ type: 'pending', phase: 'saving' })
    let refusal = ''
    try {
      const start = String(values.get('startsAt') || '')
      const body = action === 'revoke'
        ? { action, id: state.revokeId, reason: String(values.get('reason') || '') }
        : { action: 'issue', reason: String(values.get('reason') || ''), days: values.get('days') === 'forever' ? null : Number(values.get('days')), ...(start ? { startsAt: new Date(start).toISOString() } : {}) }
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) { refusal = response.status === 403 ? 'برای این تغییر دسترسی ندارید؛ تاریخچه را بازخوانی کنید.' : String(result.error || 'تغییر ثبت نشد؛ دوباره تلاش کنید.'); throw new Error(refusal) }
      form.reset()
      await load(undefined, undefined, action === 'revoke' ? 'محدودیت لغو شد؛ سایر محدودیت‌ها حفظ شدند.' : 'محدودیت ثبت شد.')
    } catch (error) {
      dispatch({ type: 'failed', error: refusal || 'نتیجهٔ درخواست مشخص نشد؛ پیش از ارسال دوباره، تاریخچه را بازخوانی کنید.' })
      requestAnimationFrame(() => feedback.current?.focus())
    }
  }
  function reload(before?: number) { dispatch({ type: 'pending', phase: 'loading' }); void load(undefined, before) }
  return <section className={`card mb-4 ${styles.panel}`} dir="rtl" aria-labelledby={`${prefix}-title`} aria-busy={busy} data-testid="global-restrictions">
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
      <h2 id={`${prefix}-title`} className="h3">محدودیت سراسری حساب</h2>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => reload()}>بازخوانی تاریخچه</button>
    </div>
    <p className="muted text-sm mb-3">محدودیت سراسری، ورود و اقدامات حساب را متوقف می‌کند. محدودیت انجمن مستقل است و سوابق حساب حفظ می‌شوند.</p>
    <p ref={feedback} tabIndex={-1} className={state.error ? 'error-text mb-3' : 'success-text mb-3'} role={state.error ? 'alert' : 'status'}>{state.error || state.message || (busy ? 'در حال دریافت…' : '')}</p>
    {state.phase !== 'forbidden' && <>
      {state.canIssue ? <form onSubmit={submit} className="mb-5">
        <fieldset disabled={!ready} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="font-bold mb-3">ثبت محدودیت جدید</legend>
          <input type="hidden" name="action" value="issue" />
          <label className="grid gap-2 mb-3" htmlFor={`${prefix}-reason`}>دلیل محدودیت<textarea className="textarea" id={`${prefix}-reason`} name="reason" required maxLength={500} rows={3} autoComplete="off" /></label>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,14rem),1fr))' }}>
            <label className="grid gap-2" htmlFor={`${prefix}-days`}>مدت<select className="select" id={`${prefix}-days`} name="days" defaultValue="7"><option value="1">یک روز</option><option value="7">هفت روز</option><option value="30">۳۰ روز</option><option value="90">۹۰ روز</option><option value="365">یک سال</option><option value="forever">بدون تاریخ پایان</option></select></label>
            <label className="grid gap-2" htmlFor={`${prefix}-start`}>شروع اختیاری<JalaliDateInput withTime className="input" id={`${prefix}-start`} name="startsAt" aria-describedby={`${prefix}-start-help`} /><span id={`${prefix}-start-help`} className="muted text-xs">خالی باشد: شروع از اکنون؛ زمان بر اساس منطقهٔ دستگاه شماست.</span></label>
          </div>
          <label className="flex items-center gap-2 mb-3"><input type="checkbox" name="confirm" required />ثبت محدودیت برای این حساب را تأیید می‌کنم.</label>
          <button type="submit" className="btn" style={{ background: 'var(--text)', color: 'var(--bg)' }}>{state.phase === 'saving' ? 'در حال ثبت…' : 'ثبت محدودیت'}</button>
        </fieldset>
      </form> : ready && <p className="muted mb-3">ثبت محدودیت برای حساب خودتان مجاز نیست.</p>}
      <h3 className="font-bold mb-3">تاریخچهٔ محدودیت‌ها</h3>
      {ready && !state.rows.length && <p className="muted">محدودیت سراسری ثبت نشده است.</p>}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {state.rows.map(row => <li key={row.id} className="mb-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem', overflowWrap: 'anywhere', contentVisibility: 'auto' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <strong>محدودیت <span className="num">#{row.id}</span></strong>
            <span className="badge">{row.revokedAt ? 'لغوشده' : Date.parse(row.startsAt) > state.loadedAt ? 'زمان‌بندی‌شده' : row.expiresAt && Date.parse(row.expiresAt) <= state.loadedAt ? 'منقضی‌شده' : 'فعال'}</span>
          </div>
          <p className="text-sm mt-2 mb-2" dir="auto">{row.reason}</p>
          <p className="muted text-xs">شروع: {date(row.startsAt)} · پایان: {row.expiresAt ? date(row.expiresAt) : 'بدون تاریخ پایان'} · ثبت‌کننده: {row.issuedByUserId ?? 'ثبت قدیمی'}</p>
          {row.revokedAt ? <p className="muted text-sm mt-2" dir="auto">لغو: {date(row.revokedAt)} · {row.revocationReason}</p> : <button type="button" className="btn btn-ghost mt-2" disabled={!ready} onClick={() => dispatch({ type: 'revoke', id: row.id })}>لغو محدودیت #{row.id}</button>}
        </li>)}
      </ol>
      {state.revokeId !== null && <form onSubmit={submit} className="mt-3">
        <fieldset disabled={!ready} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="font-bold mb-3">لغو محدودیت #{state.revokeId}</legend><input type="hidden" name="action" value="revoke" />
          <label className="grid gap-2 mb-3" htmlFor={`${prefix}-revoke-reason`}>دلیل لغو<textarea className="textarea" id={`${prefix}-revoke-reason`} name="reason" required maxLength={500} rows={2} autoComplete="off" /></label>
          <label className="flex items-center gap-2 mb-3"><input type="checkbox" name="confirm" required />لغو همین محدودیت را تأیید می‌کنم.</label>
          <div className="flex gap-2 flex-wrap"><button type="submit" className="btn" style={{ background: 'var(--text)', color: 'var(--bg)' }}>تأیید لغو محدودیت</button><button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'revoke', id: null })}>انصراف</button></div>
        </fieldset>
      </form>}
      {state.nextBefore !== null && <button type="button" className="btn btn-ghost mt-3" disabled={busy} onClick={() => reload(state.nextBefore!)}>نمایش سوابق بیشتر</button>}
    </>}
  </section>
}
