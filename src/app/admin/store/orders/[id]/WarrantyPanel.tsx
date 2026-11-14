'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { fa, faDate, Notice, send, useJson } from '../../shared'

type Warranty = { id: number; serial: string; imei: string; warrantyStartsAt: string; warrantyEndsAt: string; provider: string; conditions: string; updatedAt: string; tickets: { id: number; subject: string; status: string; updatedAt: string }[]; repairs: { id: number; stage: string; status: string; createdAt: string }[] }
type Device = { unitIndex: number; serial: string; imei: string; warranty: Warranty | null }
type View = { orderId: number; lines: { id: number; line: number; name: string; variantName: string; quantity: number; devices: Device[] }[] }
type Draft = { warrantyStartsAt: string; warrantyEndsAt: string; provider: string; conditions: string }
const blank: Draft = { warrantyStartsAt: '', warrantyEndsAt: '', provider: '', conditions: '' }
const draftFrom = (row?: Warranty | null): Draft => row ? { warrantyStartsAt: row.warrantyStartsAt.slice(0, 10), warrantyEndsAt: row.warrantyEndsAt.slice(0, 10), provider: row.provider, conditions: row.conditions } : blank

export default function WarrantyPanel({ orderId }: { orderId: number }) {
  const { data, error, reload } = useJson<View>(`/api/admin/store/orders/${orderId}/warranties`)
  const [editing, setEditing] = useState<string>('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (error) return <section className="sa-card"><h2>ضمانت دستگاه‌ها</h2><Notice tone="error">{error}</Notice></section>
  if (!data) return <section className="sa-card"><h2>ضمانت دستگاه‌ها</h2><div className="sa-skeleton" aria-busy="true" /></section>
  const hasIdentifiedDevices = data.lines.some(line => line.devices.length)
  const keyFor = (lineId: number, unitIndex: number) => `${lineId}:${unitIndex}`
  const setDraft = (key: string, value: Partial<Draft>) => setDrafts(current => ({ ...current, [key]: { ...blank, ...current[key], ...value } }))
  async function save(event: React.FormEvent, lineId: number, unitIndex: number, warranty: Warranty | null, key: string) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setResult(null)
    const draft = drafts[key] || draftFrom(warranty)
    const response = await send(`/api/admin/store/${warranty ? `warranties/${warranty.id}` : `orders/${orderId}/warranties`}`, warranty ? 'PUT' : 'POST', {
      ...(warranty ? { expectedUpdatedAt: warranty.updatedAt } : { orderLineId: lineId, unitIndex }),
      ...draft,
    })
    setBusy(false)
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setEditing(''); setDrafts(current => { const next = { ...current }; delete next[key]; return next })
    setResult({ tone: 'ok', text: warranty ? 'اطلاعات ضمانت به‌روز شد' : 'ضمانت دستگاه ثبت شد' })
    await reload()
  }
  return <section className="sa-card">
    <header className="sa-card-head"><div><h2>ضمانت ثبت‌شدهٔ دستگاه</h2><p className="sa-hint">برای هر دستگاه فقط با اقدام صریح کارمند و بر پایهٔ شناسهٔ ثبت‌شده در فروش ایجاد می‌شود؛ این اطلاعات به‌تنهایی تأیید پوشش یا نتیجهٔ ضمانت نیست.</p></div></header>
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    {!hasIdentifiedDevices && <Notice>در تصویر فروش این سفارش، سریال یا IMEI برای کالای فیزیکی ثبت نشده است.</Notice>}
    <div className="sa-stack">{data.lines.map(line => line.devices.map(device => {
      const key = keyFor(line.id, device.unitIndex), warranty = device.warranty
      const draft = drafts[key] || draftFrom(warranty)
      return <article className="sa-repeat" key={key}>
        <header className="sa-card-head"><div><h3>{line.name}{line.variantName ? ` · ${line.variantName}` : ''}</h3><small>ردیف {fa(line.line + 1)} · دستگاه {fa(device.unitIndex + 1)}</small></div>
          {!editing && <button type="button" className="btn btn-ghost" onClick={() => { setDraft(key, draftFrom(warranty)); setEditing(key); setResult(null) }}>{warranty ? 'ویرایش اطلاعات ثبت‌شده' : 'ثبت ضمانت این دستگاه'}</button>}
        </header>
        {(device.serial || device.imei) && <p className="num" dir="ltr">{[device.serial && `Serial: ${device.serial}`, device.imei && `IMEI: ${device.imei}`].filter(Boolean).join(' · ')}</p>}
        {warranty && editing !== key && <><dl className="sa-kv"><div><dt>ارائه‌دهنده</dt><dd>{warranty.provider}</dd></div><div><dt>شروع</dt><dd>{faDate(warranty.warrantyStartsAt)}</dd></div><div><dt>پایان</dt><dd>{faDate(warranty.warrantyEndsAt)}</dd></div></dl><p>{warranty.conditions}</p>
          {!!warranty.tickets.length && <p>تیکت‌ها: {warranty.tickets.map(ticket => <Link key={ticket.id} href={`/admin/tickets?ticket=${ticket.id}`} className="sa-link">#{fa(ticket.id)} · {ticket.status} </Link>)}</p>}
          {!!warranty.repairs.length && <p>درخواست‌های تعمیر: {warranty.repairs.map(repair => <Link key={repair.id} href={`/admin/forms?submission=${repair.id}`} className="sa-link">#{fa(repair.id)} · {repair.stage || repair.status} </Link>)}</p>}
          <Link href={`/admin/forms/counter?warrantyDevice=${warranty.id}`} className="btn btn-ghost">ثبت پذیرش تعمیر از مسیر Forms</Link>
        </>}
        {editing === key && <form className="sa-form" onSubmit={event => void save(event, line.id, device.unitIndex, warranty, key)}>
          <div className="sa-row"><label className="sa-field"><span>شروع ضمانت</span><input className="input" type="date" required value={draft.warrantyStartsAt} onChange={event => setDraft(key, { warrantyStartsAt: event.target.value })} /></label><label className="sa-field"><span>پایان ضمانت</span><input className="input" type="date" required value={draft.warrantyEndsAt} onChange={event => setDraft(key, { warrantyEndsAt: event.target.value })} /></label></div>
          <label className="sa-field"><span>ارائه‌دهنده</span><input className="input" required minLength={2} maxLength={160} value={draft.provider} onChange={event => setDraft(key, { provider: event.target.value })} /></label>
          <label className="sa-field"><span>شرایط اعلام‌شده</span><textarea className="input" required minLength={2} maxLength={2000} rows={3} value={draft.conditions} onChange={event => setDraft(key, { conditions: event.target.value })} /></label>
          <div className="sa-row"><button className="btn btn-primary" disabled={busy}>{busy ? 'در حال ثبت…' : 'ذخیرهٔ اطلاعات'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing('')}>انصراف</button></div>
        </form>}
      </article>
    }))}</div>
  </section>
}
