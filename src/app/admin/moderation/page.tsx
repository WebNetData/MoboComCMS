'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { Notice, fa as faNumber, faDate, send, useJson } from '../store/shared'
import { QUEUE_SOURCES, waitingTone, type QueueDecision, type QueueGroup, type QueueItem, type QueueSourceKey, BATCH_LIMIT, batchIds, batchOutcome } from '@/modules/moderation/domain/queue'

type Case = { status: string; assignee: { id: number; name: string } | null; mine: boolean; note: string } | null
type Item = QueueItem & { case: Case }
type Group = Omit<QueueGroup, 'items'> & { items: Item[] }
type Queue = { total: number; groups: Group[]; failed: QueueSourceKey[]; decided: { id: number; source: QueueSourceKey; itemId: number; decision: string; by: string; at: string; note: string }[]; mine: { source: QueueSourceKey; itemId: number; claimedAt: string }[] }

const TONE = { none: '', ok: 'is-ok', warn: 'is-warn', late: 'is-bad' } as const

/**
 * Everything that waits for a staff decision, in one place. A plain yes or no is sent from here to the
 * owning section's own admin API; anything that needs more is decided on that section's page.
 */
export default function ModerationPage() {
  const { locale } = useI18n()
  const isFa = locale === 'fa'
  const L = (faText: string, en: string) => isFa ? faText : en
  const { data, error, loading, reload } = useJson<Queue>('/api/admin/moderation')
  const [busy, setBusy] = useState('')
  // Items ticked for one decision on all of them, per source.
  const [picked, setPicked] = useState<Record<string, number[]>>({})
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const now = new Date()
  const num = (value: number) => isFa ? faNumber(value) : value.toLocaleString('en-US')
  const waited = (iso: string) => {
    const hours = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000))
    if (hours < 1) return L('کمتر از یک ساعت', 'under an hour')
    if (hours < 24) return L(`${num(hours)} ساعت`, `${hours} h`)
    return L(`${num(Math.floor(hours / 24))} روز`, `${Math.floor(hours / 24)} d`)
  }
  const sourceOf = (key: QueueSourceKey) => QUEUE_SOURCES.find((item) => item.key === key)
  const failedLabel = (key: QueueSourceKey) => { const source = sourceOf(key); return source ? (isFa ? source.label : source.labelEn) : key }
  const when = (iso: string) => isFa ? faDate(iso, true) : new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tehran' })

  /** The staff work around an item (taking it, letting go, a note, the record of a decision): never the decision itself. */
  const caseAction = (group: Group, id: number, body: Record<string, unknown>) => send('/api/admin/moderation', 'POST', { source: group.key, id, ...body })
  async function work(group: Group, item: Item, body: Record<string, unknown>, done: string) {
    setBusy(`${group.key}:${item.id}`); setMessage(null)
    let result = await caseAction(group, item.id, body)
    // A colleague holds it: taking it over is a deliberate second step.
    if (!result.ok && body.action === 'claim' && window.confirm(L(`${result.error}. با این حال برمی‌دارید؟`, `${result.error}. Take it over anyway?`))) result = await caseAction(group, item.id, { ...body, takeOver: true })
    setBusy('')
    setMessage(result.ok ? { tone: 'ok', text: done } : { tone: 'error', text: result.error })
    await reload()
  }

  async function decide(group: Group, item: Item, decision: QueueDecision) {
    const question = isFa ? decision.confirm : decision.confirmEn || decision.confirm
    if (question && !window.confirm(question)) return
    const request = decision.request(item.id)
    setBusy(`${group.key}:${item.id}`); setMessage(null)
    const result = await send(request.url, request.method, request.body)
    // The owner accepted the decision: the case records who sent it from here.
    if (result.ok) await caseAction(group, item.id, { action: 'decided', decision: decision.key })
    setBusy('')
    setMessage(result.ok
      ? { tone: 'ok', text: L(`«${isFa ? decision.label : decision.labelEn}» ثبت شد.`, `${decision.labelEn} saved.`) }
      : { tone: 'error', text: result.error })
    // Read the queue again either way: after a refusal the item may already have been decided by someone else.
    await reload()
  }

  /** The same decision for every ticked item of a source: one request each, to the owning module, in order. */
  async function decideMany(group: Group, decision: QueueDecision) {
    const ids = batchIds(picked[group.key] || [], group.items.map((item) => item.id))
    if (!ids.length) return
    const name = isFa ? decision.label : decision.labelEn
    if (!window.confirm(L(`«${name}» برای ${num(ids.length)} مورد ثبت شود؟`, `${name} ${ids.length} item(s)?`))) return
    setBusy(`${group.key}:batch`); setMessage(null)
    const results = []
    for (const id of ids) { const request = decision.request(id); const result = await send(request.url, request.method, request.body); if (result.ok) await caseAction(group, id, { action: 'decided', decision: decision.key }); results.push(result) }
    const outcome = batchOutcome(results)
    setBusy(''); setPicked((current) => ({ ...current, [group.key]: [] }))
    setMessage(outcome.failed
      ? { tone: 'error', text: L(`«${name}» برای ${num(outcome.done)} مورد ثبت شد و ${num(outcome.failed)} مورد نشد: ${outcome.reasons.join('؛ ')}`, `${name}: ${outcome.done} saved, ${outcome.failed} not: ${outcome.reasons.join('; ')}`) }
      : { tone: 'ok', text: L(`«${name}» برای ${num(outcome.done)} مورد ثبت شد.`, `${name} saved for ${outcome.done} item(s).`) })
    await reload()
  }
  const toggle = (key: string, id: number) => setPicked((current) => { const list = current[key] || []; return { ...current, [key]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] } })

  return <div className="sa" dir={isFa ? 'rtl' : 'ltr'}>
    <header className="sa-head">
      <h1>{L('صف بررسی', 'Moderation queue')}</h1>
      <div className="sa-head-actions">
        {data && <span className={`sa-state ${data.total ? 'is-warn' : 'is-ok'}`}>{data.total ? L(`${num(data.total)} مورد منتظر بررسی`, `${data.total} waiting`) : L('چیزی منتظر بررسی نیست', 'Nothing is waiting')}</span>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>{L('تازه‌سازی', 'Refresh')}</button>
      </div>
    </header>
    <p className="sa-sub">{L('قدیمی‌ترین انتظار بالاتر است. تأیید یا رد ساده را همین‌جا ثبت کنید؛ هر تصمیمی که به پاسخ، توضیح یا دیدن محتوای گزارش‌شده نیاز دارد در صفحهٔ خود آن بخش گرفته می‌شود.', 'The longest wait comes first. A plain approve or reject can be given here; anything that needs an answer, a note or the reported content is decided on that section’s own page.')}</p>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {data && data.failed.length > 0 && <Notice tone="error">{L('خواندن این بخش‌ها ممکن نشد: ', 'These sources could not be read: ')}{data.failed.map(failedLabel).join(isFa ? '، ' : ', ')}</Notice>}
    {!data && loading && <p className="sa-empty">{L('در حال دریافت…', 'Loading…')}</p>}
    {data && <div className="sa-stack">
      {data.groups.filter((group) => group.count > 0).map((group) => {
        const tone = waitingTone(group.oldestAt, now)
        const decisions = sourceOf(group.key)?.decisions || []
        return <section key={group.key} className="sa-card" aria-label={isFa ? group.label : group.labelEn}>
          <header className="sa-card-head">
            <h2>{isFa ? group.label : group.labelEn}</h2>
            <div className="sa-head-actions">
              {group.oldestAt && <span className={`sa-state ${TONE[tone]}`}>{L(`قدیمی‌ترین: ${waited(group.oldestAt)}`, `Oldest: ${waited(group.oldestAt)}`)}</span>}
              <span className="sa-tag">{num(group.count)}</span>
              <Link href={group.href} className="sa-link">{L('صفحهٔ این بخش', 'Open section')}</Link>
            </div>
          </header>
          {decisions.length > 0 && group.items.length > 1 && (() => {
            const ids = batchIds(picked[group.key] || [], group.items.map((item) => item.id)), all = group.items.slice(0, BATCH_LIMIT).map((item) => item.id)
            return <div className="mq-batch">
              <label><input type="checkbox" checked={ids.length > 0 && ids.length === all.length} onChange={(event) => setPicked((current) => ({ ...current, [group.key]: event.target.checked ? all : [] }))} disabled={!!busy} />{L('انتخاب همهٔ این فهرست', 'Select all listed')}</label>
              {ids.length > 0 && <span className="sa-sub">{L(`${num(ids.length)} مورد انتخاب شده`, `${ids.length} selected`)}</span>}
              {ids.length > 0 && <span className="sa-head-actions">{decisions.map((decision) => <button key={decision.key} type="button" className={`btn btn-sm ${decision.key === 'approve' ? 'btn-primary' : 'btn-ghost'}`} disabled={!!busy} aria-busy={busy === `${group.key}:batch`} onClick={() => void decideMany(group, decision)}>{isFa ? decision.label : decision.labelEn} {L('انتخاب‌شده‌ها', 'selected')}</button>)}</span>}
            </div>
          })()}
          {decisions.length ? <ul className="mq-items">
            {group.items.map((item) => {
              const working = busy === `${group.key}:${item.id}`
              return <li key={item.id} className="mq-item">
                <p className="mq-text">{group.items.length > 1 && <input type="checkbox" className="mq-pick" checked={(picked[group.key] || []).includes(item.id)} onChange={() => toggle(group.key, item.id)} disabled={!!busy} aria-label={L('انتخاب این مورد', 'Select this item')} />}{item.full || item.text || '—'}</p>
                <div className="mq-case">
                  {item.case?.assignee && <span className={`sa-state ${item.case.mine ? 'is-ok' : 'is-warn'}`}>{item.case.mine ? L('در دست شما', 'You are on it') : L(`در دست ${item.case.assignee.name}`, `${item.case.assignee.name} is on it`)}</span>}
                  {item.case?.note && <span className="mq-note" dir="auto">📝 {item.case.note}</span>}
                  {item.case?.mine
                    ? <button type="button" className="sa-link" disabled={!!busy} onClick={() => void work(group, item, { action: 'release' }, L('رها شد.', 'Released.'))}>{L('رها می‌کنم', 'Release')}</button>
                    : <button type="button" className="sa-link" disabled={!!busy} onClick={() => void work(group, item, { action: 'claim' }, L('این مورد در دست شماست.', 'You are on it.'))}>{L('برمی‌دارم', 'I\'ll take it')}</button>}
                  <button type="button" className="sa-link" disabled={!!busy} onClick={() => { const note = window.prompt(L('یادداشت برای همکاران (خالی = پاک‌کردن):', 'A note for colleagues (empty removes it):'), item.case?.note || ''); if (note !== null) void work(group, item, { action: 'note', note }, L('یادداشت ذخیره شد.', 'Note saved.')) }}>{item.case?.note ? L('ویرایش یادداشت', 'Edit note') : L('یادداشت', 'Note')}</button>
                </div>
                <div className="mq-foot">
                  <small className="sa-sub">{[item.by, item.about].filter(Boolean).join(' · ') || '—'} · <time dateTime={item.at}>{when(item.at)}</time></small>
                  <div className="sa-head-actions">{decisions.map((decision) => <button key={decision.key} type="button" className={`btn btn-sm ${decision.key === 'approve' ? 'btn-primary' : 'btn-ghost'}`} disabled={!!busy} aria-busy={working} onClick={() => void decide(group, item, decision)}>{isFa ? decision.label : decision.labelEn}</button>)}</div>
                </div>
              </li>
            })}
            {group.count > group.items.length && <li className="mq-item"><Link href={group.href} className="sa-link">{L(`و ${num(group.count - group.items.length)} مورد دیگر در صفحهٔ این بخش`, `and ${group.count - group.items.length} more on the section page`)}</Link></li>}
          </ul> : <ul className="sa-rows">
            {group.items.map((item) => <li key={item.id}><Link href={group.href}>
              <span className="sa-grow"><b>{item.text || '—'}</b><small>{[item.by, item.about].filter(Boolean).join(' · ') || '—'}</small></span>
              <small className="sa-sub"><time dateTime={item.at}>{when(item.at)}</time></small>
            </Link></li>)}
            {group.count > group.items.length && <li><Link href={group.href}><span className="sa-grow"><small>{L(`و ${num(group.count - group.items.length)} مورد دیگر`, `and ${group.count - group.items.length} more`)}</small></span></Link></li>}
          </ul>}
        </section>
      })}
      {data.decided.length > 0 && <section className="sa-card" aria-label={L('تصمیم‌های اخیر', 'Recent decisions')}>
        <header className="sa-card-head"><h2>{L('تصمیم‌های اخیر از همین صفحه', 'Recent decisions from this page')}</h2></header>
        <ul className="sa-rows">{data.decided.map((row) => <li key={row.id}><span className="sa-grow"><b>{row.decision === 'approve' ? L('تأیید', 'Approved') : L('رد', 'Rejected')} · {failedLabel(row.source)} #{num(row.itemId)}</b><small>{row.by || '—'}{row.note ? ` · 📝 ${row.note}` : ''}</small></span><small className="sa-sub">{row.at ? <time dateTime={row.at}>{when(row.at)}</time> : ''}</small></li>)}</ul>
      </section>}
      {/* Sources with nothing waiting share one compact card. */}
      {data.groups.some((group) => group.count === 0) && <section className="sa-card" aria-label={L('بخش‌های بدون مورد', 'Sources with nothing waiting')}>
        <header className="sa-card-head"><h2>{L('بدون مورد منتظر', 'Nothing waiting')}</h2></header>
        <ul className="sa-rows">{data.groups.filter((group) => group.count === 0).map((group) => <li key={group.key}><Link href={group.href}><span className="sa-grow"><b>{isFa ? group.label : group.labelEn}</b></span><small className="sa-sub">{L('باز کردن', 'Open')}</small></Link></li>)}</ul>
      </section>}
    </div>}
  </div>
}
