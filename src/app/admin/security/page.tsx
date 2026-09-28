'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa } from '../store/shared'

type Policy = { requireAdmin2fa: boolean; emailReset: boolean; smsReset: boolean }
type Stats = { enabled: number; admins: number; adminsWith: number }
type Tone = { tone: 'ok' | 'error'; text: string } | null

/** Sign-in security: password reset channels, the staff 2-step rule, and support resets. */
export default function SecurityAdminPage() {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [saved, setSaved] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState(false)
  const [who, setWho] = useState('')
  const [resetNotice, setResetNotice] = useState<Tone>(null)

  const load = () => fetch('/api/admin/security', { cache: 'no-store' }).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
    if (!ok) { setNotice({ tone: 'error', text: data?.error || 'بارگذاری انجام نشد' }); return }
    setPolicy(data.policy); setSaved(JSON.stringify(data.policy)); setStats(data.stats)
  }).catch(() => setNotice({ tone: 'error', text: 'ارتباط برقرار نشد' }))
  useEffect(() => { void load() }, [])

  async function save() {
    if (!policy) return
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/security', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: data?.error || 'ذخیره انجام نشد' }); return }
    setPolicy(data.policy); setSaved(JSON.stringify(data.policy)); setNotice({ tone: 'ok', text: 'ذخیره شد.' })
  }

  async function resetUser(e: FormEvent) {
    e.preventDefault()
    if (!window.confirm(`ورود دو مرحله‌ای «${who}» خاموش شود؟ فقط وقتی انجام دهید که هویت کاربر را مطمئن شده‌اید.`)) return
    setResetNotice(null)
    const response = await fetch('/api/admin/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-2fa', user: who }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (!response?.ok) { setResetNotice({ tone: 'error', text: data?.error || 'انجام نشد' }); return }
    setResetNotice({ tone: 'ok', text: 'ورود دو مرحله‌ای کاربر خاموش شد؛ او می‌تواند دوباره آن را راه‌اندازی کند.' }); setWho('')
    void load()
  }

  if (!policy) return <div className="sa" dir="rtl">{notice ? <Notice tone="error">{notice.text}</Notice> : <div className="sa-skeleton" />}</div>
  const dirty = JSON.stringify(policy) !== saved

  return <div className="sa" dir="rtl">
    <header className="sa-head">
      <div><h1>امنیت ورود</h1><p className="sa-hint">بازیابی رمز عبور، ورود دو مرحله‌ای و قوانین امنیتی حساب‌ها.</p></div>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    {stats && <div className="sa-kpis">
      <div className="sa-kpi"><span>کاربران با ورود دو مرحله‌ای</span><b className="num">{fa(stats.enabled)}</b></div>
      <div className="sa-kpi"><span>مدیران فعال</span><b className="num">{fa(stats.admins)}</b></div>
      <div className="sa-kpi"><span>مدیران با ورود دو مرحله‌ای</span><b>{fa(stats.adminsWith)} از {fa(stats.admins)}</b></div>
    </div>}

    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>بازیابی رمز عبور</h2></header>
          <label className="sa-check"><input type="checkbox" checked={policy.emailReset} onChange={(e) => setPolicy({ ...policy, emailReset: e.target.checked })} />بازیابی با پیوند ایمیلی (۳۰ دقیقه اعتبار، یک‌بارمصرف)</label>
          <p className="sa-hint">به ارسال ایمیل سایت نیاز دارد؛ از <Link href="/admin/email">تنظیمات ایمیل</Link> فعالش کنید.</p>
          <label className="sa-check"><input type="checkbox" checked={policy.smsReset} onChange={(e) => setPolicy({ ...policy, smsReset: e.target.checked })} />بازیابی با کد پیامکی به موبایل تأییدشدهٔ حساب</label>
          <p className="sa-hint">به پنل پیامک نیاز دارد؛ از <Link href="/admin/sms">تنظیمات پیامک</Link> فعالش کنید. پس از تغییر رمز، همهٔ نشست‌های باز حساب خارج می‌شوند و به کاربر ایمیل هشدار می‌رود.</p>
        </section>

        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>ورود دو مرحله‌ای کارکنان</h2></header>
          <label className="sa-check"><input type="checkbox" checked={policy.requireAdmin2fa} onChange={(e) => setPolicy({ ...policy, requireAdmin2fa: e.target.checked })} />ورود دو مرحله‌ای برای همهٔ مدیران الزامی باشد</label>
          <p className="sa-hint">مدیری که آن را فعال نکرده باشد، به‌جای پنل مدیریت به صفحهٔ راه‌اندازی هدایت می‌شود و API مدیریت هم برای او بسته است. پیش از روشن‌کردن، ورود دو مرحله‌ای حساب خودتان را در <Link href="/dashboard/profile#two-factor">تنظیمات حساب</Link> فعال کنید.</p>
        </section>
      </div>

      <form className="sa-card sa-form" onSubmit={resetUser}>
        <header className="sa-card-head"><h2>بازنشانی برای کاربر</h2></header>
        <p className="sa-hint">اگر کاربری هم گوشی و هم کدهای پشتیبان را از دست داده، پس از احراز هویت (مثلاً از طریق تیکت) ورود دو مرحله‌ای‌اش را خاموش کنید. این کار در گزارش فعالیت مدیران ثبت می‌شود.</p>
        <label className="sa-field"><span>شناسه، ایمیل یا موبایل کاربر</span><input className="input" dir="ltr" value={who} onChange={(e) => setWho(e.target.value)} required /></label>
        {resetNotice && <Notice tone={resetNotice.tone}>{resetNotice.text}</Notice>}
        <div className="sa-head-actions"><button className="btn btn-ghost" disabled={!who.trim()}>خاموش کردن ورود دو مرحله‌ای کاربر</button></div>
      </form>
    </div>
  </div>
}
