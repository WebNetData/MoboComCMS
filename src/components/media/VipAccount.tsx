'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { isLifetime } from '@/modules/membership/domain/plans'
import type { memberOverview } from '@/modules/membership/server/lifecycle'

type Overview = Awaited<ReturnType<typeof memberOverview>>
// A fixed zone, so the server and the browser write the same day.
const date = (value: Date | string) => new Date(value).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' })
const KIND: Record<string, string> = { PURCHASE: 'خرید', GIFT: 'هدیه', ADMIN: 'از طرف مدیر' }

/** A member's own page: where they stand, renewal, cancelling and history. */
export default function VipAccount({ initial }: { initial: Overview }) {
  const [data, setData] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [planId, setPlanId] = useState(initial.account.renewPlanId || initial.plans[0]?.id || 0)
  const [leaving, setLeaving] = useState(false)
  const [reason, setReason] = useState('')

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/me/membership', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) { setData(result); setMessage({ ok: true, text: done }); setLeaving(false) } else setMessage({ ok: false, text: result?.error || 'انجام نشد؛ دوباره تلاش کنید' })
  }

  const active = !!data.endsAt
  const color = data.standing?.color || 'var(--vip-gold-2)'
  const left = data.endsAt ? Math.max(0, Math.ceil((new Date(data.endsAt).getTime() - Date.now()) / 86_400_000)) : 0

  return <div className="va">
    <section className="va-status" style={{ ['--tier' as string]: color }} aria-label="وضعیت اشتراک">
      <div>
        <span className="va-label">{active ? 'سطح شما' : 'وضعیت'}</span>
        <h2>{active ? data.standing?.tierName || 'عضو ویژه' : 'اشتراک فعالی ندارید'}</h2>
        {active && <p>{data.lifetime ? 'اشتراک مادام‌العمر' : <>تا {date(data.endsAt!)}</>}</p>}
      </div>
      {active && !data.lifetime && <div className="va-days"><b>{left.toLocaleString('fa-IR')}</b><span>روز مانده</span></div>}
      <div className="va-links"><Link href="/vip#plans" className="btn vip-btn">{active ? 'تمدید یا ارتقا' : 'انتخاب پلن'}</Link></div>
    </section>

    {message && <p role="status" className={message.ok ? 'va-done' : 'error-text'}>{message.text}</p>}

    {active && !data.lifetime && <section className="va-card" aria-labelledby="va-renew">
      <h3 id="va-renew">تمدید خودکار</h3>
      <p className="muted">یک روز پیش از پایان اشتراک، مبلغ پلن از کیف پول شما برداشته می‌شود. اگر موجودی کافی نباشد به شما خبر می‌دهیم و چیزی از حساب شما کم نمی‌شود.</p>
      {data.account.renewError && <p className="error-text" role="alert">{data.account.renewError}</p>}
      {data.account.autoRenew
        ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act({ action: 'auto-renew', on: false }, 'تمدید خودکار خاموش شد')}>خاموش کردن تمدید خودکار</button>
        : <div className="va-row">
          {data.plans.length > 0 && <label className="vp-field"><span>پلن تمدید</span><select className="select" value={planId} onChange={(event) => setPlanId(Number(event.target.value))}>{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.days.toLocaleString('fa-IR')} روز</option>)}</select></label>}
          <button type="button" className="btn btn-primary" disabled={busy || !planId} onClick={() => void act({ action: 'auto-renew', on: true, planId }, 'تمدید خودکار روشن شد')}>روشن کردن تمدید خودکار</button>
        </div>}
    </section>}

    {active && !data.lifetime && <section className="va-card" aria-labelledby="va-cancel">
      <h3 id="va-cancel">لغو اشتراک</h3>
      {data.account.cancelled
        ? <><p className="muted">اشتراک شما تا پایان دوره فعال می‌ماند و تمدید نمی‌شود.</p><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act({ action: 'resume' }, 'اشتراک ادامه پیدا می‌کند')}>منصرف شدم</button></>
        : leaving
          ? <div className="va-leave">
            <label className="vp-field"><span>دلیل لغو (اختیاری)</span><input className="input" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <div className="va-row"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act({ action: 'cancel', reason }, 'لغو ثبت شد؛ تا پایان دوره دسترسی دارید')}>تأیید لغو</button><button type="button" className="btn btn-ghost" onClick={() => setLeaving(false)}>بازگشت</button></div>
          </div>
          : <><p className="muted">با لغو، تا پایان دورهٔ پرداخت‌شده دسترسی دارید و چیزی پس گرفته نمی‌شود.</p><button type="button" className="btn btn-ghost" onClick={() => setLeaving(true)}>لغو اشتراک</button></>}
    </section>}

    {data.history.length > 0 && <section className="va-card" aria-labelledby="va-history">
      <h3 id="va-history">تاریخچه</h3>
      <div className="va-scroll" tabIndex={0} role="region" aria-labelledby="va-history"><table className="va-table">
        <thead><tr><th scope="col">پلن</th><th scope="col">نوع</th><th scope="col">از</th><th scope="col">تا</th><th scope="col">فاکتور</th></tr></thead>
        <tbody>{data.history.map((row) => <tr key={row.id} className={row.revoked ? 'is-off' : ''}>
          <td>{row.plan}{row.revoked && <small> (لغوشده)</small>}</td>
          <td>{row.kind === 'TRIAL' ? 'آزمایشی' : KIND[row.source] || row.source}</td>
          <td>{date(row.startsAt)}</td>
          <td>{isLifetime(row.endsAt) ? 'مادام‌العمر' : date(row.endsAt)}</td>
          <td>{row.invoice ? <Link href={`/invoice/${encodeURIComponent(row.invoice)}`}>مشاهده</Link> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>
}
