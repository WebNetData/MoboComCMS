'use client'

import { useState } from 'react'
import { CommunityShell, Notice, Who, fa, faDate, send, useJson, type Person } from '../shared'

type Report = { id: number; reason: string; reasonLabel: string; note: string; status: string; createdAt: string; reporter: Person | null; target: { kind: string; id: number; text: string; status: string; author: Person | null; href: string } | null }

export default function CommunityReportsPage() {
  const [status, setStatus] = useState('OPEN')
  const { data, error, reload } = useJson<{ counts: Record<string, number>; reports: Report[] }>(`/api/admin/community?section=reports&status=${status}`)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  async function act(report: Report, action: 'resolve' | 'dismiss', hide = false) {
    const result = await send('/api/admin/community', 'POST', { action, id: report.id, hide })
    setMessage(result.ok ? { tone: 'ok', text: hide ? `${report.target?.kind === 'comment' ? 'دیدگاه' : 'پست'} پنهان و گزارش بسته شد` : action === 'dismiss' ? 'گزارش رد شد' : 'گزارش بسته شد' } : { tone: 'error', text: result.error })
    void reload()
  }
  return <CommunityShell title="گزارش‌های جامعه">
    <nav className="sa-subtabs" aria-label="وضعیت">{([['OPEN', 'باز'], ['RESOLVED', 'رسیدگی‌شده'], ['DISMISSED', 'ردشده']] as const).map(([key, label]) => <button key={key} type="button" className={status === key ? 'is-active' : ''} aria-pressed={status === key} onClick={() => setStatus(key)}>{label}{data?.counts[key] ? <span className="num">{fa(data.counts[key])}</span> : null}</button>)}</nav>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {!data ? <div className="sa-skeleton" aria-busy="true" /> : !data.reports.length ? <div className="sa-card sa-empty">گزارشی در این بخش نیست ✅</div>
      : data.reports.map((r) => <article key={r.id} className="sa-card ca-report">
        <header className="sa-row"><span className="sa-state is-warn">{r.reasonLabel}</span><small className="sa-sub">گزارش‌دهنده: {r.reporter?.name || '—'} · {faDate(r.createdAt, true)}</small></header>
        {r.note && <p className="sa-hint">«{r.note}»</p>}
        {r.target ? <div className="ca-target"><Who person={r.target.author} /><p dir="auto">{r.target.text || '(تصویر)'}</p><small className="sa-sub">{r.target.kind === 'comment' ? 'دیدگاه' : 'پست'} · {r.target.status === 'HIDDEN' ? 'پنهان‌شده' : 'نمایش'} · <a href={r.target.href} target="_blank" rel="noreferrer" className="sa-link">مشاهده</a></small></div> : <p className="sa-hint">مورد گزارش‌شده حذف شده است.</p>}
        {r.status === 'OPEN' && <div className="sa-actions">
          {r.target && r.target.status !== 'HIDDEN' && <button type="button" className="sa-action is-danger" onClick={() => void act(r, 'resolve', true)}>پنهان کردن و بستن گزارش</button>}
          <button type="button" className="sa-action" onClick={() => void act(r, 'resolve')}>بستن بدون تغییر</button>
          <button type="button" className="sa-action" onClick={() => void act(r, 'dismiss')}>رد گزارش</button>
        </div>}
      </article>)}
  </CommunityShell>
}
