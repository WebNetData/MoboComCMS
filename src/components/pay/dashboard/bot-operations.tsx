'use client'

import { useEffect, useRef, useState } from 'react'
import type { PayTerminalView } from '@/modules/billing/domain/pay'
import type { PayBotOperationsPage } from '@/modules/billing/domain/pay-operations'
import { api, date, labels, money } from '../client'
import { ErrorNotice, Field } from '../shared'
import BotOperationDetail from './bot-operation-detail'
import s from '../Pay.module.css'

const statuses: Record<string, string> = { WAITING: 'در انتظار پرداخت', QUEUED: 'در صف', SENDING: 'در حال ارسال', SENT: 'تأیید ثبت شده', UNKNOWN: 'نتیجه نامشخص', BLOCKED: 'متوقف', REVIEW: 'نیازمند بررسی', OVERDUE: 'از زمان مقرر گذشته' }
const initial = { q: '', terminalId: '', status: '', paymentStatus: '' }

export default function BotOperations({ terminals, revision = 0 }: { terminals: PayTerminalView[]; revision?: number }) {
  const [draft, setDraft] = useState(initial), [filters, setFilters] = useState(initial), [page, setPage] = useState(1)
  const [result, setResult] = useState<PayBotOperationsPage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false)
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const restoreFocus = useRef('')
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ ...filters, page: String(page) })
    setLoading(true); setError('')
    api<PayBotOperationsPage>(`/api/pay/bot-operations?${params}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult(data) })
      .catch(cause => { if (!controller.signal.aborted) { setResult(null); setError(cause instanceof Error ? cause.message : 'دریافت عملیات انجام نشد') } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, page, refresh, revision])
  useEffect(() => {
    if (!selected && !loading && restoreFocus.current) {
      triggers.current.get(restoreFocus.current)?.focus()
      restoreFocus.current = ''
    }
  }, [selected, loading, result])
  function close() { restoreFocus.current = selected; setSelected('') }
  const summary = result?.summary
  const metrics = summary && [
    ['در صف', summary.queued], ['در حال ارسال', summary.sending], ['نیازمند بررسی', summary.needsReview],
    ['از زمان مقرر گذشته', summary.overdue], ['در انتظار تأیید ربات پس از پرداخت', summary.paidUndelivered], ['مغایرت ثبت درآمد', summary.creditIssues],
  ] as const
  return <section className={s.card + ' ' + s.stack} dir="rtl" aria-label="عملیات ربات" aria-busy={loading || busy}>
    <header><h2>عملیات سفارش‌های ربات</h2><p className={s.muted}>نمای همهٔ سابقهٔ پذیرنده؛ گذشت زمان از موعد، وضعیت کار ثبت‌شده را نشان می‌دهد.</p></header>
    {metrics && <div className={s.grid + ' ' + s.operationMetrics}>{metrics.map(([label, value]) => <div className={s.card + ' ' + s.metric} key={label}><small>{label}</small><strong>{value.toLocaleString('fa-IR')}</strong></div>)}</div>}
    <form className={s.stack} onSubmit={event => { event.preventDefault(); setFilters({ ...draft, q: draft.q.trim() }); setPage(1); setSelected('') }}>
      <div className={s.grid}>
        <Field label="جست‌وجوی سفارش"><input value={draft.q} onChange={event => setDraft({ ...draft, q: event.target.value })} disabled={busy} /></Field>
        <Field label="پایانه"><select value={draft.terminalId} onChange={event => setDraft({ ...draft, terminalId: event.target.value })} disabled={busy}><option value="">همهٔ پایانه‌ها</option>{terminals.map(terminal => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}</select></Field>
        <Field label="وضعیت ربات"><select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })} disabled={busy}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="وضعیت پرداخت"><select value={draft.paymentStatus} onChange={event => setDraft({ ...draft, paymentStatus: event.target.value })} disabled={busy}><option value="">همهٔ پرداخت‌ها</option>{['PENDING', 'PAID', 'EXPIRED'].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></Field>
      </div>
      <div className={s.actions}><button className={s.button} type="submit" disabled={busy}>جست‌وجو و اعمال فیلتر</button><button className={s.secondary} type="button" disabled={busy} onClick={() => { setDraft(initial); setFilters(initial); setPage(1); setSelected('') }}>پاک‌کردن فیلترها</button><button className={s.secondary} type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>تازه‌کردن</button></div>
    </form>
    {loading && <p role="status">در حال دریافت عملیات…</p>}
    <ErrorNotice error={error} />
    {error && <button type="button" className={s.secondary} onClick={() => setRefresh(value => value + 1)}>تلاش دوباره</button>}
    {!loading && result && <>
      <p className={s.muted}>{result.total.toLocaleString('fa-IR')} عملیات · صفحهٔ {result.page.toLocaleString('fa-IR')} از {result.pages.toLocaleString('fa-IR')}</p>
      {!result.items.length ? <p className={s.emptyState}>عملیاتی با این فیلترها پیدا نشد.</p> : <div className={s.tableWrap} role="region" aria-label="جدول عملیات ربات" tabIndex={0}><table className={s.table}><thead><tr><th scope="col">سفارش / پایانه</th><th scope="col">پرداخت / مبلغ نهایی</th><th scope="col">ربات / قانون</th><th scope="col">تلاش / زمان</th><th scope="col">پیگیری</th></tr></thead><tbody>{result.items.map(row => <tr key={row.id}>
        <td><bdi>{row.externalId}</bdi><small className={s.tableSub}>{row.terminalName}</small></td>
        <td><span className={s.badge}>{labels[row.paymentStatus] || row.paymentStatus}</span><small className={s.tableSub}>{money(row.totalRial)}</small></td>
        <td><span className={s.badge} data-state={row.status}>{statuses[row.status] || row.status}</span><small className={s.tableSub}>{row.ruleName || 'بدون قانون'}{row.overdue ? ' · از زمان مقرر گذشته' : ''}</small></td>
        <td>{row.attempts.toLocaleString('fa-IR')}<small className={s.tableSub}>ایجاد: {date(row.createdAt)}</small><small className={s.tableSub}>تغییر: {date(row.updatedAt)}</small></td>
        <td><button ref={button => { if (button) triggers.current.set(row.id, button); else triggers.current.delete(row.id) }} type="button" className={s.secondary} disabled={busy} aria-expanded={selected === row.id} aria-controls="bot-operation-detail" onClick={() => setSelected(value => value === row.id ? '' : row.id)}>جزئیات <bdi>{row.externalId}</bdi></button></td>
      </tr>)}</tbody></table></div>}
      <nav className={s.actions} aria-label="صفحات عملیات"><button type="button" className={s.secondary} disabled={busy || loading || result.page <= 1} onClick={() => { setSelected(''); setPage(value => value - 1) }}>صفحهٔ قبل</button><button type="button" className={s.secondary} disabled={busy || loading || result.page >= result.pages} onClick={() => { setSelected(''); setPage(value => value + 1) }}>صفحهٔ بعد</button></nav>
    </>}
    {selected && <div id="bot-operation-detail"><BotOperationDetail key={selected} id={selected} revision={revision} busy={busy} onBusy={setBusy} onClose={close} onChanged={() => setRefresh(value => value + 1)} /></div>}
  </section>
}
