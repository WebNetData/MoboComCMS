'use client'

import { useState } from 'react'
import { Notice, fa, faDate, useJson } from '../shared'
import { send } from '../../store/shared'
import { VipShell } from '../shared'

type Data = {
  applications: { id: number; user: string; userId: number; plan: string; createdAt: string; paid: string }[]
  gifts: { id: number; buyer: string; plan: string; claimedBy: string; revoked: boolean; createdAt: string }[]
  teams: { id: number; name: string; owner: string; plan: string; seats: number; used: number; endsAt: string }[]
}

/** Who waits for the team's decision, and the gifts and groups running. */
export default function VipApprovalsPage() {
  const { data, error, reload } = useJson<Data>('/api/admin/membership/extras')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function decide(id: number, decision: 'APPROVED' | 'REJECTED') {
    const note = decision === 'REJECTED' ? window.prompt('دلیل رد درخواست (برای متقاضی نوشته می‌شود). مبلغ پرداختی به کیف پول او برمی‌گردد.') : ''
    if (note === null) return
    setBusy(true)
    const result = await send('/api/admin/membership/extras', 'POST', { id, decision, note })
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: decision === 'APPROVED' ? 'درخواست تأیید شد.' : 'درخواست رد شد.' } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
  }
  return <VipShell title="تأیید، هدیه و گروه">
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {data && <>
      <section className="sa-card" aria-labelledby="vip-pending">
        <header className="sa-card-head"><h2 id="vip-pending">در انتظار تأیید</h2></header>
        {data.applications.length ? <div className="sa-table-wrap"><table className="sa-table">
          <thead><tr><th>متقاضی</th><th>پلن</th><th>پرداخت</th><th>تاریخ</th><th><span className="sr-only">تصمیم</span></th></tr></thead>
          <tbody>{data.applications.map((row) => <tr key={row.id}>
            <td>{row.user}</td><td>{row.plan}</td><td>{row.paid}</td><td>{faDate(row.createdAt)}</td>
            <td><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide(row.id, 'APPROVED')}>تأیید</button> <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void decide(row.id, 'REJECTED')}>رد</button></td>
          </tr>)}</tbody>
        </table></div> : <p className="sa-hint">درخواستی در انتظار نیست.</p>}
      </section>
      <section className="sa-card" aria-labelledby="vip-teams">
        <header className="sa-card-head"><h2 id="vip-teams">گروه‌ها</h2></header>
        {data.teams.length ? <div className="sa-table-wrap"><table className="sa-table">
          <thead><tr><th>گروه</th><th>مالک</th><th>پلن</th><th>صندلی</th><th>پایان</th></tr></thead>
          <tbody>{data.teams.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.owner}</td><td>{row.plan}</td><td>{fa(row.used)} از {fa(row.seats)}</td><td>{faDate(row.endsAt)}</td></tr>)}</tbody>
        </table></div> : <p className="sa-hint">هنوز گروهی ساخته نشده است. برای پلن گروهی، در فرم پلن تعداد صندلی را وارد کنید.</p>}
      </section>
      <section className="sa-card" aria-labelledby="vip-gifts">
        <header className="sa-card-head"><h2 id="vip-gifts">هدیه‌ها</h2></header>
        {data.gifts.length ? <div className="sa-table-wrap"><table className="sa-table">
          <thead><tr><th>خریدار</th><th>پلن</th><th>وضعیت</th><th>تاریخ</th></tr></thead>
          <tbody>{data.gifts.map((row) => <tr key={row.id}><td>{row.buyer}</td><td>{row.plan}</td><td>{row.revoked ? 'لغوشده' : row.claimedBy ? `فعال‌شده توسط ${row.claimedBy}` : 'استفاده‌نشده'}</td><td>{faDate(row.createdAt)}</td></tr>)}</tbody>
        </table></div> : <p className="sa-hint">هدیه‌ای خریده نشده است.</p>}
      </section>
    </>}
  </VipShell>
}
