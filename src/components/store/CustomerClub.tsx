'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'

type Tier = { id: string; name: string; minLifetime: number; multiplier: number; color: string; perks: string }
type Club = {
  enabled: boolean; balance: number; lifetime: number; tier: Tier; next: Tier | null; toNext: number; tiers: Tier[]; balanceValue: number
  rules: { earnPoints: number; earnStepToman: number; pointValueToman: number; minRedeem: number; signupBonus: number; reviewBonus: number }
  history: { id: number; points: number; kind: string; note: string; createdAt: string }[]
}

const fa = (value: number) => value.toLocaleString('fa-IR')
const KIND: Record<string, string> = { EARN_ORDER: 'خرید', REVERSE_ORDER: 'برگشت خرید', REDEEM: 'تبدیل به اعتبار', ADMIN: 'تنظیم مدیر', BONUS: 'هدیه' }

export default function CustomerClub() {
  const [data, setData] = useState<Club | null>(null)
  const [error, setError] = useState('')
  const [points, setPoints] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const load = useCallback(async () => {
    const response = await fetch('/api/store/club', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setData(body); setError('') } else setError(body?.error || 'بارگذاری نشد')
  }, [])
  useEffect(() => { void load() }, [load])

  async function redeem(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(null)
    const response = await fetch('/api/store/club', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'redeem', points: Number(points) }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) { setNotice({ ok: true, text: `${fa(body.points)} امتیاز به ${fa(body.toman)} تومان اعتبار کیف پول تبدیل شد.` }); setPoints(''); void load() } else setNotice({ ok: false, text: body?.error || 'انجام نشد' })
  }

  if (error) return <p className="gc-notice is-bad">{error}</p>
  if (!data) return <div className="gc-skeleton" aria-busy="true" />
  if (!data.enabled) return <div className="dt-page"><header className="dt-head"><div><h1>باشگاه مشتریان</h1><p>با هر خرید امتیاز بگیرید، سطح‌تان را بالا ببرید و امتیازها را خرج کنید.</p></div></header><div className="dt-empty"><b>باشگاه مشتریان فعلاً فعال نیست</b><span>وقتی فعال شود، سطح و امتیاز شما همین‌جا نمایش داده می‌شود.</span></div></div>
  const span = data.next ? data.next.minLifetime - data.tier.minLifetime : 1
  const progress = data.next ? Math.min(100, Math.round(((data.lifetime - data.tier.minLifetime) / span) * 100)) : 100
  const value = Number(points) > 0 ? Number(points) * data.rules.pointValueToman : 0
  return <div className="lc-page">
    <header className="gc-head"><h1 className="h2">باشگاه مشتریان</h1><p className="muted">با هر خرید امتیاز بگیرید، سطح‌تان را بالا ببرید و امتیازها را به اعتبار خرید تبدیل کنید.</p></header>
    <section className="lc-hero" style={{ ['--tier' as string]: data.tier.color }}>
      <div className="lc-tier">
        <span className="lc-badge" aria-hidden="true">★</span>
        <div><small>سطح شما</small><b>{data.tier.name}</b><span className="muted">{data.tier.perks}</span></div>
      </div>
      <div className="lc-balance"><small>امتیاز قابل استفاده</small><b className="num">{fa(data.balance)}</b><span className="muted">معادل {fa(data.balanceValue)} تومان</span></div>
      <div className="lc-progress">
        <div className="lc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="پیشرفت تا سطح بعد"><i style={{ inlineSize: `${progress}%` }} /></div>
        <small>{data.next ? <>{fa(data.toNext)} امتیاز دیگر تا سطح <b>{data.next.name}</b> (مجموع امتیاز کسب‌شده: {fa(data.lifetime)})</> : 'شما در بالاترین سطح باشگاه هستید'}</small>
      </div>
    </section>

    <div className="lc-grid">
      <form className="card lc-redeem" onSubmit={redeem}>
        <h2>تبدیل امتیاز به اعتبار</h2>
        <p className="muted">هر امتیاز = {fa(data.rules.pointValueToman)} تومان · حداقل {fa(data.rules.minRedeem)} امتیاز</p>
        <div className="lc-redeem-row">
          <input className="input num" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ''))} placeholder="تعداد امتیاز" aria-label="تعداد امتیاز" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPoints(String(data.balance))} disabled={!data.balance}>همه</button>
        </div>
        {value > 0 && <p className="lc-value">= <b className="num">{fa(value)}</b> تومان اعتبار کیف پول</p>}
        {notice && <p className={`gc-notice ${notice.ok ? 'is-ok' : 'is-bad'}`} role="status">{notice.text}{notice.ok && <> — <Link href="/dashboard/wallet">کیف پول</Link></>}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !Number(points) || Number(points) < data.rules.minRedeem || Number(points) > data.balance}>{busy ? 'در حال تبدیل…' : 'تبدیل به اعتبار'}</button>
      </form>

      <section className="card lc-rules">
        <h2>چطور امتیاز بگیرم؟</h2>
        <ul>
          <li><b>خرید:</b> هر {fa(data.rules.earnStepToman)} تومان خرید = {fa(data.rules.earnPoints)} امتیاز (ضریب سطح شما: ×{fa(data.tier.multiplier)})</li>
          {data.rules.reviewBonus > 0 && <li><b>ثبت نظر:</b> {fa(data.rules.reviewBonus)} امتیاز برای هر نظر تأییدشده</li>}
          {data.rules.signupBonus > 0 && <li><b>هدیهٔ عضویت:</b> {fa(data.rules.signupBonus)} امتیاز پس از اولین خرید</li>}
          <li>امتیاز خریدهای لغو یا مرجوع‌شده کم می‌شود.</li>
        </ul>
        <ol className="lc-tiers">{data.tiers.map((tier) => <li key={tier.id} className={tier.id === data.tier.id ? 'is-current' : ''} style={{ ['--tier' as string]: tier.color }}>
          <span className="lc-dot" aria-hidden="true" /><b>{tier.name}</b><small>از {fa(tier.minLifetime)} امتیاز · ×{fa(tier.multiplier)}</small>
        </li>)}</ol>
      </section>
    </div>

    <section className="card lc-history">
      <h2>تاریخچهٔ امتیاز</h2>
      {data.history.length ? <table className="data"><thead><tr><th>تاریخ</th><th>نوع</th><th>شرح</th><th>امتیاز</th></tr></thead><tbody>
        {data.history.map((row) => <tr key={row.id}><td className="num">{new Date(row.createdAt).toLocaleDateString('fa-IR')}</td><td>{KIND[row.kind] || row.kind}</td><td>{row.note}</td><td className={`num ${row.points > 0 ? 'success-text' : 'error-text'}`}>{row.points > 0 ? '+' : '−'}{fa(Math.abs(row.points))}</td></tr>)}
      </tbody></table> : <p className="muted">هنوز امتیازی ندارید؛ با اولین خرید شروع کنید. <Link href="/products">رفتن به فروشگاه</Link></p>}
    </section>
  </div>
}
