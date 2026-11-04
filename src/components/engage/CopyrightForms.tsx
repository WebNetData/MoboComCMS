'use client'

import { useHumanCheck } from '@/components/HumanCheck'
import { useState } from 'react'

type Status = { code: string; label: string; status: string; resolution: string; createdAt: string; resolvedAt: string | null; workTitle: string }

/** Public takedown request form. */
export function CopyrightReportForm({ prefillUrl = '' }: { prefillUrl?: string }) {
  const human = useHumanCheck('form')
  const [form, setForm] = useState({ name: '', email: '', organization: '', phone: '', role: 'OWNER', workTitle: '', originalUrl: '', infringingUrls: prefillUrl, description: '', signature: '', statement: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !human.ready) return
    setBusy(true); setError('')
    const response = await fetch('/api/copyright', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, humanCheck: human.token }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false); human.reset()
    if (!response?.ok) { setError(data?.error || 'ثبت گزارش انجام نشد؛ دوباره تلاش کنید'); return }
    setCode(data.code)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (code) {
    return (
      <div className="cr-done" role="status">
        <span aria-hidden="true">✓</span>
        <h2>گزارش شما ثبت شد</h2>
        <p>کد پیگیری: <strong dir="ltr" className="cr-code">{code}</strong></p>
        <p className="muted">این کد را نگه دارید. نتیجهٔ بررسی را با همین کد و ایمیل خود در پایین همین صفحه ببینید. معمولاً ظرف ۷۲ ساعت کاری بررسی می‌شود.</p>
      </div>
    )
  }

  return (
    <form className="cr-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend>مشخصات گزارش‌دهنده</legend>
        <div className="cr-grid">
          <label className="studio-field"><span>نام و نام خانوادگی / نام شرکت *</span><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} autoComplete="name" /></label>
          <label className="studio-field"><span>ایمیل *</span><input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set({ email: e.target.value })} required maxLength={200} autoComplete="email" /></label>
          <label className="studio-field"><span>سازمان (اختیاری)</span><input className="input" value={form.organization} onChange={(e) => set({ organization: e.target.value })} maxLength={200} autoComplete="organization" /></label>
          <label className="studio-field"><span>تلفن (اختیاری)</span><input className="input" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={30} autoComplete="tel" /></label>
        </div>
        <div className="cr-roles" role="radiogroup" aria-label="نقش شما">
          <label><input type="radio" name="role" checked={form.role === 'OWNER'} onChange={() => set({ role: 'OWNER' })} />صاحب حق نشر هستم</label>
          <label><input type="radio" name="role" checked={form.role === 'AGENT'} onChange={() => set({ role: 'AGENT' })} />نمایندهٔ قانونی صاحب اثر هستم</label>
        </div>
      </fieldset>
      <fieldset>
        <legend>اثر و محتوای ناقض</legend>
        <label className="studio-field"><span>نام اثر دارای حق نشر *</span><input className="input" value={form.workTitle} onChange={(e) => set({ workTitle: e.target.value })} required maxLength={300} placeholder="مثلاً نام نرم‌افزار، فیلم، آلبوم یا کتاب" /></label>
        <label className="studio-field"><span>نشانی نسخهٔ اصلی یا مدرک مالکیت (اختیاری)</span><input className="input" dir="ltr" value={form.originalUrl} onChange={(e) => set({ originalUrl: e.target.value })} placeholder="https://" /></label>
        <label className="studio-field"><span>نشانی صفحه‌های ناقض در سایت ما * (هر نشانی در یک خط)</span><textarea className="input" dir="ltr" rows={3} value={form.infringingUrls} onChange={(e) => set({ infringingUrls: e.target.value })} required placeholder="https://…/software/example" /></label>
        <label className="studio-field"><span>توضیح *</span><textarea className="input" rows={5} value={form.description} onChange={(e) => set({ description: e.target.value })} required maxLength={5000} placeholder="چه محتوایی و چرا حق شما را نقض می‌کند؟ اگر فقط لینک دانلود خاصی مشکل دارد مشخص کنید." /></label>
      </fieldset>
      <fieldset>
        <legend>تأیید و امضا</legend>
        <label className="cr-statement"><input type="checkbox" checked={form.statement} onChange={(e) => set({ statement: e.target.checked })} required />با حسن نیت اعلام می‌کنم استفادهٔ گزارش‌شده بدون اجازهٔ صاحب اثر است و اطلاعات این فرم درست است. می‌دانم گزارش نادرست ممکن است پیگرد قانونی داشته باشد.</label>
        <label className="studio-field"><span>امضا (نام خود را دقیقاً مانند بالا تایپ کنید) *</span><input className="input" value={form.signature} onChange={(e) => set({ signature: e.target.value })} required maxLength={120} /></label>
      </fieldset>
      {human.widget}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy || !human.ready}>{busy ? 'در حال ثبت…' : 'ثبت گزارش'}</button>
    </form>
  )
}

/** Status lookup with tracking code + email. */
export function CopyrightStatusLookup() {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function lookup(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus(null)
    const response = await fetch(`/api/copyright?code=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) setStatus(data)
    else setError(data?.error || 'پیدا نشد')
  }

  return (
    <form className="cr-lookup" onSubmit={lookup}>
      <input className="input" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CR-XXXXXXXX" aria-label="کد پیگیری" required />
      <input className="input" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" aria-label="ایمیل" required />
      <button className="btn btn-ghost" disabled={busy}>{busy ? '…' : 'پیگیری'}</button>
      {error && <p className="error-text" role="alert">{error}</p>}
      {status && (
        <div className={`cr-status is-${status.status.toLowerCase()}`} role="status">
          <b>{status.label}</b>
          <span className="muted">«{status.workTitle}» · ثبت: {new Date(status.createdAt).toLocaleDateString('fa-IR')}{status.resolvedAt ? ` · نتیجه: ${new Date(status.resolvedAt).toLocaleDateString('fa-IR')}` : ''}</span>
          {status.resolution && <p>{status.resolution}</p>}
        </div>
      )}
    </form>
  )
}
