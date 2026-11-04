'use client'

import { useState } from 'react'
import { cycleMeta, kindMeta } from '@/modules/hosting/domain/catalog'
import { SERVICE_STATUS, type ServiceStatus } from '@/modules/hosting/domain/services'
import { Notice, Pager, fa, faDate, send, useJson } from '../../store/shared'
import { HostingShell, toman } from '../shared'

type Action = { id: number; kind: string; status: string; actor: string; detail: string; error: string; createdAt: string }
type Row = {
  id: number; label: string; status: string; cycle: string; hostname: string; ipv4: string; ipv6: string; panelUrl: string; loginUser: string; note: string
  hasPassword: boolean; priceMinor: string; nextDueAt: string | null; createdAt: string; allowTraffic: boolean | null; allowUpgrade: boolean | null
  user: { id: number; email: string; name: string | null }; product: { kind: string; fulfillment: string; allowTraffic: boolean; allowUpgrade: boolean }; provider: { name: string } | null; actions: Action[]
}
type Data = { services: Row[]; page: number; pages: number; total: number; waiting: number; tasks: number }
type Draft = { id: number; label: string; first: boolean; hostname: string; ipv4: string; ipv6: string; panelUrl: string; loginUser: string; password: string; note: string; allowTraffic: string; allowUpgrade: string }

const ACTION: Record<string, string> = { TRAFFIC: 'ترافیک اضافه', UPGRADE: 'ارتقا', RENEW: 'تمدید', PROVISION: 'ساخت خودکار', DELIVER: 'تحویل', NOTE: 'به‌روزرسانی', SUSPEND: 'تعلیق', UNSUSPEND: 'رفع تعلیق', TERMINATE: 'حذف', REVEAL: 'نمایش رمز توسط مشتری' }
const tri = (value: boolean | null) => (value === null ? '' : value ? 'on' : 'off')
const fromTri = (value: string) => (value === 'on' ? true : value === 'off' ? false : null)

export default function HostingServicesPage() {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useJson<Data>(`/api/admin/hosting/services?status=${status}&q=${encodeURIComponent(query)}&page=${page}`)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true)
    const result = await send('/api/admin/hosting/services', 'POST', body)
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: done } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
    return result.ok
  }
  const edit = (row: Row) => {
    setNotice(null)
    setDraft({ id: row.id, label: row.label, first: ['PENDING', 'PROVISIONING', 'FAILED'].includes(row.status), hostname: row.hostname, ipv4: row.ipv4, ipv6: row.ipv6, panelUrl: row.panelUrl, loginUser: row.loginUser, password: '', note: row.note, allowTraffic: tri(row.allowTraffic), allowUpgrade: tri(row.allowUpgrade) })
    window.scrollTo({ top: 0 })
  }
  async function deliver() {
    if (!draft) return
    const { id, first, label: _label, allowTraffic, allowUpgrade, ...service } = draft
    if (await run({ op: 'deliver', id, service: { ...service, allowTraffic: fromTri(allowTraffic), allowUpgrade: fromTri(allowUpgrade) } }, first ? 'سرویس تحویل شد و به مشتری اطلاع داده شد.' : 'اطلاعات سرویس ذخیره شد.')) setDraft(null)
  }
  const change = (row: Row, op: 'SUSPEND' | 'UNSUSPEND' | 'TERMINATE') => {
    const words = { SUSPEND: 'معلق شود', UNSUSPEND: 'از تعلیق خارج شود', TERMINATE: 'حذف شود؟ این کار برگشت ندارد' }[op]
    const reason = op === 'UNSUSPEND' ? '' : window.prompt(`سرویس «${row.label}» ${words}\nدلیل برای مشتری (اختیاری):`, '')
    if (reason === null) return
    void run({ op, id: row.id, reason }, 'وضعیت سرویس تغییر کرد.')
  }

  return <HostingShell title="سرویس‌های مشتریان" hint="سفارش‌های پرداخت‌شده، تحویل دستی، تعلیق و حذف. هر کار در تاریخچهٔ سرویس ثبت و به مشتری اطلاع داده می‌شود.">
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    {draft && <section className="sa-card hx-form" aria-label="تحویل سرویس">
      <header className="sa-card-head"><h2>{draft.first ? `تحویل «${draft.label}»` : `ویرایش «${draft.label}»`}</h2></header>
      {draft.first && <p className="sa-hint">پس از ذخیره، سرویس فعال می‌شود، دورهٔ آن از همین لحظه شروع می‌شود و اطلاعات ورود در داشبورد مشتری نمایش داده می‌شود.</p>}
      <div className="hx-row">
        <label className="sa-field"><span>آی‌پی نسخهٔ ۴</span><input className="input" dir="ltr" value={draft.ipv4} placeholder="203.0.113.10" onChange={(event) => set('ipv4', event.target.value)} /></label>
        <label className="sa-field"><span>آی‌پی نسخهٔ ۶</span><input className="input" dir="ltr" value={draft.ipv6} onChange={(event) => set('ipv6', event.target.value)} /></label>
        <label className="sa-field"><span>نام میزبان یا دامنه</span><input className="input" dir="ltr" value={draft.hostname} onChange={(event) => set('hostname', event.target.value)} /></label>
        <label className="sa-field"><span>نشانی پنل (https)</span><input className="input" dir="ltr" value={draft.panelUrl} placeholder="https://panel.example.com" onChange={(event) => set('panelUrl', event.target.value)} /></label>
      </div>
      <div className="hx-row">
        <label className="sa-field"><span>نام کاربری {draft.first ? '*' : ''}</span><input className="input" dir="ltr" autoComplete="off" value={draft.loginUser} onChange={(event) => set('loginUser', event.target.value)} /></label>
        <label className="sa-field"><span>رمز {draft.first ? '*' : '(خالی: بدون تغییر)'}</span><input className="input" dir="ltr" type="password" autoComplete="new-password" value={draft.password} onChange={(event) => set('password', event.target.value)} /></label>
      </div>
      <label className="sa-field"><span>یادداشت برای مشتری</span><textarea className="input" rows={3} maxLength={2000} value={draft.note} onChange={(event) => set('note', event.target.value)} /></label>
      <div className="hx-row">
        <label className="sa-field"><span>خرید ترافیک اضافه</span><select className="input" value={draft.allowTraffic} onChange={(event) => set('allowTraffic', event.target.value)}><option value="">مثل محصول</option><option value="on">مجاز</option><option value="off">بسته</option></select></label>
        <label className="sa-field"><span>ارتقای پلن</span><select className="input" value={draft.allowUpgrade} onChange={(event) => set('allowUpgrade', event.target.value)}><option value="">مثل محصول</option><option value="on">مجاز</option><option value="off">بسته</option></select></label>
      </div>
      <div className="hx-save">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void deliver()}>{draft.first ? 'تحویل و فعال‌سازی' : 'ذخیره'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDraft(null)}>انصراف</button>
      </div>
    </section>}

    <section className="sa-card" aria-label="فهرست سرویس‌ها">
      <div className="hx-filters">
        <div className="hx-choice" role="group" aria-label="وضعیت"><div>
          {[['', `همه${data ? ` (${fa(data.total)})` : ''}`], ...Object.entries(SERVICE_STATUS).map(([id, item]) => [id, id === 'PENDING' && data?.waiting ? `${item.label} (${fa(data.waiting)})` : item.label]), ['TASKS', `کارهای افزودنی${data?.tasks ? ` (${fa(data.tasks)})` : ''}`]].map(([id, label]) => <label key={id} className={status === id ? 'is-on' : ''}><input type="radio" name="status" checked={status === id} onChange={() => { setStatus(id); setPage(1) }} /><span>{label}</span></label>)}
        </div></div>
        <form role="search" onSubmit={(event) => { event.preventDefault(); setQuery(q); setPage(1) }}><input className="input" type="search" aria-label="جست‌وجو" placeholder="ایمیل، دامنه، آی‌پی یا شماره" value={q} onChange={(event) => setQ(event.target.value)} /></form>
      </div>
      {data && !data.services.length && <div className="hx-empty"><h2>{status || query ? 'سرویسی با این شرایط نیست' : 'هنوز سرویسی فروخته نشده است'}</h2><p className="sa-hint">پس از پرداخت هر سفارش میزبانی، سرویس آن این‌جا ساخته می‌شود.</p></div>}
      {data && data.services.length > 0 && <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>سرویس</th><th>مشتری</th><th>دوره و مبلغ</th><th>تمدید</th><th>وضعیت</th><th><span className="sr-only">عملیات</span></th></tr></thead>
        <tbody>{data.services.map((row) => {
          const state = SERVICE_STATUS[row.status as ServiceStatus]
          const waiting = ['PENDING', 'PROVISIONING', 'FAILED'].includes(row.status)
          return [<tr key={row.id}>
            <td><b>{row.label}</b> <span className="hx-spec">#{fa(row.id)}</span><div className="hx-spec" dir="ltr">{row.hostname || row.ipv4 || '—'}</div><div className="hx-spec">{kindMeta(row.product.kind)?.label} · {row.product.fulfillment === 'DRIVER' ? row.provider?.name || 'سامانه' : 'دستی'}</div></td>
            <td><span dir="ltr">{row.user.email}</span>{row.user.name && <div className="hx-spec">{row.user.name}</div>}</td>
            <td>{cycleMeta(row.cycle)?.label}<div className="hx-spec">{toman(row.priceMinor)}</div></td>
            <td>{row.nextDueAt ? faDate(row.nextDueAt) : '—'}</td>
            <td><span className={`sa-state ${state?.tone || ''}`}>{state?.label || row.status}</span>{row.actions.filter((action) => action.status === 'WAITING' && (action.kind === 'TRAFFIC' || action.kind === 'UPGRADE')).map((action) => <div key={action.id} className="hx-task"><span>{action.detail}</span><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run({ op: 'complete-task', id: action.id }, 'کار انجام‌شده ثبت شد و به مشتری اطلاع داده شد.')}>اعمال شد</button></div>)}</td>
            <td><div className="hx-actions">
              {row.status !== 'TERMINATED' && <button type="button" className={`btn btn-sm ${waiting ? 'btn-primary' : 'btn-ghost'}`} onClick={() => edit(row)}>{waiting ? 'تحویل' : 'ویرایش'}</button>}
              {row.status === 'ACTIVE' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => change(row, 'SUSPEND')}>تعلیق</button>}
              {row.status === 'SUSPENDED' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => change(row, 'UNSUSPEND')}>رفع تعلیق</button>}
              {row.status !== 'TERMINATED' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => change(row, 'TERMINATE')}>حذف</button>}
              <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>تاریخچه</button>
            </div></td>
          </tr>,
          open === row.id && <tr key={`${row.id}-history`} className="hx-history-row"><td colSpan={6}>
            <ol className="hx-history">{row.actions.map((action) => <li key={action.id}><b>{ACTION[action.kind] || action.kind}</b> <span className="hx-spec">{action.actor === 'STAFF' ? 'کارشناس' : action.actor === 'CUSTOMER' ? 'مشتری' : 'سیستم'} · {faDate(action.createdAt, true)}{action.status === 'WAITING' ? ' · در انتظار' : action.status === 'FAILED' ? ' · ناموفق' : ''}</span>{(action.detail || action.error) && <div className="hx-spec">{action.error || action.detail}</div>}</li>)}</ol>
          </td></tr>]
        })}</tbody>
      </table></div>}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </section>
  </HostingShell>
}
