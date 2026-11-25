'use client'
import { useCallback, useEffect, useState } from 'react'
import type { PaySettlementQueue, PaySettlementBatchResult } from '@/modules/billing/domain/pay-settlement-center'
import { api, json, money, labels } from '../client'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'
import d from './SettlementDesk.module.css'
import { SettlementCard } from './settlement-desk/settlement-card'

export default function SettlementDesk({ allowed }: { allowed: boolean }) {
  const [queue, setQueue] = useState<PaySettlementQueue | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [q, setQ] = useState(''), [status, setStatus] = useState(''), [phase, setPhase] = useState(''), [page, setPage] = useState(1), [selected, setSelected] = useState<string[]>([]), [reason, setReason] = useState(''), [references, setReferences] = useState<Record<string,string>>({}), [results, setResults] = useState<PaySettlementBatchResult['items']>([])
  const load = useCallback(async () => { if (!allowed) return; try { setQueue(await api<PaySettlementQueue>(`/api/admin/mobocom-pay/settlement-center?${new URLSearchParams({ q, status, phase, page: String(page) })}`)); setError(''); setSelected([]) } catch (e) { setError(e instanceof Error ? e.message : 'دریافت صف ناموفق بود') } }, [allowed, q, status, phase, page])
  useEffect(() => { void load() }, [load])
  const selectedIds = new Set(selected)
  async function decide(id: string, version: number | undefined, action: 'approve'|'reject'|'paid') { if (version == null) { setError('نسخه درخواست در دسترس نیست؛ صف را دوباره دریافت کنید'); return } setBusy(true); setError(''); setMessage(''); try { await api('/api/admin/mobocom-pay/settlements', json('PATCH', { id, version, action, ...(action === 'reject' ? { reason } : {}), ...(action === 'paid' ? { reference: references[id] || '' } : {}) })); setMessage('تصمیم ثبت شد'); await load() } catch (e) { setError(e instanceof Error ? e.message : 'ثبت تصمیم ناموفق بود') } finally { setBusy(false) } }
  async function batch(action: 'approve'|'reject') { if (!queue) return; const items = queue.items.filter(x => selectedIds.has(x.id)); if (items.some(x => x.version == null)) { setError('نسخه درخواست در دسترس نیست؛ صف را دوباره دریافت کنید'); return } setBusy(true); setError(''); setResults([]); try { const result = await api<PaySettlementBatchResult>('/api/admin/mobocom-pay/settlement-batches', json('POST', { action, items: items.map(x => ({ id: x.id, version: x.version })), ...(action === 'reject' ? { reason } : {}) })); setResults(result.items); await load() } catch (e) { setError(e instanceof Error ? e.message : 'ثبت گروهی ناموفق بود') } finally { setBusy(false) } }
  if (!allowed) return <p>دسترسی به میز تسویه برای حساب شما فعال نیست</p>
  return <section className={`${s.stack} ${d.desk}`}><header className={d.hero}><h2>میز بررسی تسویه</h2><p>بررسی درخواست‌ها و ثبت تصمیم؛ انتقال وجه به صورت خودکار انجام نمی‌شود</p></header><div className={s.actions}><button type="button" className={s.secondary} disabled={busy} onClick={() => void load()}>بازخوانی صف تسویه</button></div><ErrorNotice error={error} />{message && <p role="status">{message}</p>}{!queue && !error && <p role="status">در حال دریافت صف…</p>}
    {queue && <><div className={d.metrics}>{[['سررسیدشده',queue.counts.due],['زمان‌دار',queue.counts.scheduled],['تأیید دوم',queue.counts.secondApproval],['تأییدشده',queue.counts.approved]].map(([label,count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div><p>آستانه فعلی بررسی دوم: {money(queue.approvalThresholdRial)}</p>
      <div className={d.filters}><Field label="جست‌وجو"><input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} /></Field><Field label="وضعیت"><select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">همه</option>{['REQUESTED','APPROVED','PAID','REJECTED'].map(x => <option key={x} value={x}>{labels[x] || x}</option>)}</select></Field><Field label="مرحله"><select value={phase} onChange={e => { setPhase(e.target.value); setPage(1) }}><option value="">همه</option><option value="due">سررسیدشده</option><option value="scheduled">زمان‌دار</option><option value="second">تأیید دوم</option><option value="approved">تأییدشده</option></select></Field></div>
      <div className={`${s.card} ${s.stack}`}><Field label="دلیل رد"><input value={reason} onChange={e => setReason(e.target.value)} /></Field><div className={s.actions}><span>{selected.length} از ۲۵ انتخاب شده</span><button className={s.secondary} type="button" disabled={busy || !selected.length} onClick={() => void batch('approve')}>تأیید انتخاب‌شده‌ها</button><button className={s.secondary} type="button" disabled={busy || !selected.length || !reason.trim()} onClick={() => void batch('reject')}>رد انتخاب‌شده‌ها</button></div>{results.map(r => <p key={r.id} role="status"><bdi>{r.id}</bdi> · {r.message}</p>)}</div>
      {!queue.items.length && <p className={d.empty}>درخواستی با این شرایط یافت نشد</p>}
      <div className={d.requestList}>{queue.items.map(x => <SettlementCard key={x.id} row={x} selected={selectedIds.has(x.id)}
        selectionDisabled={busy || !['REQUESTED','APPROVED'].includes(x.status) || (!selectedIds.has(x.id) && selected.length >= 25)}
        busy={busy} reason={reason} reference={references[x.id] || ''}
        onSelect={checked => setSelected(previous => checked ? [...previous,x.id] : previous.filter(id => id !== x.id))}
        onReference={value => setReferences(previous => ({ ...previous, [x.id]: value }))}
        onDecide={action => void decide(x.id,x.version,action)}
      />)}</div><div className={s.actions}><button className={s.secondary} type="button" disabled={page <= 1} onClick={() => setPage(page-1)}>قبلی</button><span>صفحه {queue.page} از {queue.pages}</span><button className={s.secondary} type="button" disabled={page >= queue.pages} onClick={() => setPage(page+1)}>بعدی</button></div>
    </>}
  </section>
}
