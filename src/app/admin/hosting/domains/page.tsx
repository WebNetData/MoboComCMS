'use client'

import { useState } from 'react'
import { DOMAIN_STATUS, type DomainStatus } from '@/modules/hosting/domain/domains'
import { Notice, Pager, fa, faDate, send, useJson } from '../../store/shared'
import { HostingShell, toman } from '../shared'

type Action = { id: number; kind: string; status: string; actor: string; detail: string; createdAt: string }
type Row = { id: number; name: string; display: string; status: string; kind: string; years: number; renewMinor: string; expiresAt: string | null; createdAt: string; handle: string; hasAuthCode: boolean; nameservers: string[]; autoRenew: boolean; user: { email: string; name: string | null }; actions: Action[] }
type Data = { domains: Row[]; page: number; pages: number; total: number; tasks: number }
const ACTION: Record<string, string> = { REGISTER: 'ثبت', TRANSFER: 'انتقال', RENEW: 'تمدید در رجیستری', NAMESERVERS: 'نیم‌سرورها', AUTHCODE: 'کد انتقال', CANCEL: 'لغو', NOTE: 'یادداشت', EXPIRE: 'انقضا' }

export default function HostingDomainsPage() {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useJson<Data>(`/api/admin/hosting/domains?status=${status}&q=${encodeURIComponent(query)}&page=${page}`)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true)
    const result = await send('/api/admin/hosting/domains', 'POST', body)
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: done } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
  }
  const complete = (row: Row) => {
    const expiresAt = window.prompt(`«${row.display}» در رجیستری ${row.kind === 'TRANSFER' ? 'منتقل' : 'ثبت'} شد؟\nتاریخ انقضا (YYYY-MM-DD، خالی = ${fa(row.years)} سال از امروز):`, '')
    if (expiresAt === null) return
    void run({ op: 'complete', id: row.id, expiresAt: expiresAt.trim() || undefined }, 'دامنه فعال شد و به مشتری اطلاع داده شد.')
  }
  const cancel = (row: Row) => {
    const reason = window.prompt(`سفارش «${row.display}» لغو و مبلغ به کیف پول مشتری برگردد؟\nدلیل برای مشتری:`, 'دامنه پیش از ثبت گرفته شد')
    if (reason === null) return
    void run({ op: 'cancel', id: row.id, reason }, 'سفارش لغو شد و مبلغ برگشت.')
  }
  const task = (action: Action) => {
    const note = window.prompt(`«${action.detail}» انجام شد؟ یادداشت برای مشتری (مثلاً کد انتقال، اختیاری):`, '')
    if (note === null) return
    void run({ op: 'complete-task', id: action.id, note }, 'انجام شد و به مشتری اطلاع داده شد.')
  }

  return <HostingShell title="دامنه‌ها" hint="سفارش‌های ثبت و انتقال، تمدید و درخواست‌های مشتری. کارهای رجیستری تا اتصال ثبت‌کننده دستی انجام می‌شوند.">
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card" aria-label="فهرست دامنه‌ها">
      <div className="hx-filters">
        <div className="hx-choice" role="group" aria-label="وضعیت"><div>
          {[['', `همه${data ? ` (${fa(data.total)})` : ''}`], ['TASKS', `کارهای رجیستری${data?.tasks ? ` (${fa(data.tasks)})` : ''}`], ...Object.entries(DOMAIN_STATUS).map(([id, item]) => [id, item.label])].map(([id, label]) => <label key={id} className={status === id ? 'is-on' : ''}><input type="radio" name="status" checked={status === id} onChange={() => { setStatus(id); setPage(1) }} /><span>{label}</span></label>)}
        </div></div>
        <form role="search" onSubmit={(event) => { event.preventDefault(); setQuery(q); setPage(1) }}><input className="input" type="search" aria-label="جست‌وجو" placeholder="دامنه، ایمیل یا شناسهٔ ایرنیک" value={q} onChange={(event) => setQ(event.target.value)} /></form>
      </div>
      {data && !data.domains.length && <div className="hx-empty"><h2>{status || query ? 'دامنه‌ای با این شرایط نیست' : 'هنوز دامنه‌ای سفارش داده نشده است'}</h2></div>}
      {data && data.domains.length > 0 && <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>دامنه</th><th>مشتری</th><th>انقضا</th><th>وضعیت</th><th><span className="sr-only">عملیات</span></th></tr></thead>
        <tbody>{data.domains.map((row) => {
          const state = DOMAIN_STATUS[row.status as DomainStatus]
          const waiting = row.actions.filter((action) => action.status === 'WAITING' && !['REGISTER', 'TRANSFER'].includes(action.kind))
          return [<tr key={row.id}>
            <td><b dir="ltr">{row.display}</b><div className="hx-spec">{row.kind === 'TRANSFER' ? 'انتقال' : `ثبت ${fa(row.years)} ساله`} · تمدید {toman(row.renewMinor)}{row.handle ? ` · ${row.handle}` : ''}{row.hasAuthCode ? ' · کد انتقال دارد' : ''}</div></td>
            <td><span dir="ltr">{row.user.email}</span></td>
            <td>{row.expiresAt ? faDate(row.expiresAt) : '—'}</td>
            <td><span className={`sa-state ${state?.tone || ''}`}>{state?.label || row.status}</span>{waiting.map((action) => <div key={action.id} className="hx-task"><span>{action.detail}</span><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => task(action)}>انجام شد</button></div>)}</td>
            <td><div className="hx-actions">
              {row.status === 'PENDING' && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => complete(row)}>{row.kind === 'TRANSFER' ? 'انتقال انجام شد' : 'ثبت شد'}</button>}
              {row.status === 'PENDING' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => cancel(row)}>لغو و برگشت وجه</button>}
              <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>تاریخچه</button>
            </div></td>
          </tr>,
          open === row.id && <tr key={`${row.id}-h`} className="hx-history-row"><td colSpan={5}>
            {row.nameservers.length > 0 && <p className="hx-spec" dir="ltr">NS: {row.nameservers.join(' · ')}</p>}
            <ol className="hx-history">{row.actions.map((action) => <li key={action.id}><b>{ACTION[action.kind] || action.kind}</b> <span className="hx-spec">{action.actor === 'STAFF' ? 'کارشناس' : action.actor === 'CUSTOMER' ? 'مشتری' : 'سیستم'} · {faDate(action.createdAt, true)}{action.status === 'WAITING' ? ' · در انتظار' : ''}</span>{action.detail && <div className="hx-spec">{action.detail}</div>}</li>)}</ol>
          </td></tr>]
        })}</tbody>
      </table></div>}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </section>
  </HostingShell>
}
