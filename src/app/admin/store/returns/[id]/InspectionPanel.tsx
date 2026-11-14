'use client'

import { useState } from 'react'
import { Notice, send, useJson } from '../../shared'
import { latinDigits } from '@/shared/text/digits'

type Disposition = 'HEALTHY' | 'DAMAGED' | 'INCOMPLETE'
type Line = { line: number; quantity: number; name: string; variantName: string }
type Segment = Line & { disposition?: Disposition; approvedQuantity?: number; actorId?: number; inspectedAt?: string; note?: string }
type View = { lines: Line[]; inspection: { status: string; updatedAt: string; canReceive: boolean; lines: Segment[]; segments?: Segment[] } }
const label: Record<Disposition, string> = { HEALTHY: 'سالم', DAMAGED: 'معیوب', INCOMPLETE: 'ناقص' }
const outcomes: Disposition[] = ['HEALTHY', 'DAMAGED', 'INCOMPLETE']
type Draft = { healthy: string; damaged: string; incomplete: string; destination: string; note: string }
const empty: Draft = { healthy: '0', damaged: '0', incomplete: '0', destination: '', note: '' }
const quantity = (value: string) => /^\d+$/.test(latinDigits(value)) ? Number(latinDigits(value)) : -1

export default function InspectionPanel({ returnId, onChanged }: { returnId: number; onChanged: () => void }) {
  const { data, error, reload } = useJson<View>(`/api/admin/store/returns/${returnId}`)
  const locations = useJson<{ locations: { id: number; name: string; active: boolean; isQuarantine: boolean }[] }>('/api/admin/store/stock?locations=1')
  const [draft, setDraft] = useState<Record<number, Draft>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const [received, setReceived] = useState(false)
  const inspection = data?.inspection
  const physical = inspection?.lines || []
  const patch = (line: number, value: Partial<Draft>) => { setDraft(current => ({ ...current, [line]: { ...empty, ...current[line], ...value } })); setSaved(false) }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!inspection || busy) return
    const lines = []
    for (const line of physical) {
      const row = draft[line.line] || empty, counts = [quantity(row.healthy), quantity(row.damaged), quantity(row.incomplete)]
      if (counts.some(count => !Number.isSafeInteger(count) || count < 0) || counts.reduce((sum, count) => sum + count, 0) !== line.quantity) { setMessage(`جمع تعداد سالم، معیوب و ناقص «${line.name}» باید ${line.quantity.toLocaleString('fa-IR')} باشد`); return }
      if (counts[0] > 0 && !row.destination) { setMessage(`انبار مقصد کالای سالم «${line.name}» را انتخاب کنید`); return }
      for (let index = 0; index < outcomes.length; index++) if (counts[index] > 0) lines.push({ line: line.line, quantity: counts[index], disposition: outcomes[index], approvedQuantity: index === 0 ? counts[index] : 0, ...(index === 0 ? { destinationLocationId: Number(row.destination) } : {}), note: row.note })
    }
    setBusy(true); setMessage(''); setSaved(false)
    try {
      const response = await send(`/api/admin/store/returns/${returnId}/inspection`, 'POST', { expectedUpdatedAt: inspection.updatedAt, lines })
      if (!response.ok) { setMessage(response.error); return }
      setSaved(true); setDraft({}); await reload(); onChanged()
    } finally { setBusy(false) }
  }
  async function receive() {
    if (!inspection || !received || busy) return
    setBusy(true); setMessage('')
    try {
      const result = await send(`/api/admin/store/returns/${returnId}/inspection`, 'POST', { action: 'receive', expectedUpdatedAt: inspection.updatedAt })
      if (!result.ok) { setMessage(result.error); return }
      setReceived(false); await reload(); onChanged()
    } finally { setBusy(false) }
  }
  if (inspection?.status === 'NOT_REQUIRED' && !inspection.canReceive) return null
  if (inspection?.canReceive) return <section className="sa-card" aria-label="دریافت کالای مرجوعی"><header className="sa-card-head"><h2>دریافت کالای مرجوعی</h2></header>
    <p>بازپرداخت ثبت شده است؛ ورود فیزیکی کالاها هنوز ثبت نشده است.</p>
    <label className="sa-check"><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} disabled={busy} />همهٔ کالاهای فیزیکی این مرجوعی را دریافت کرده‌ام</label>
    <button type="button" className="btn" disabled={!received || busy} onClick={() => void receive()}>ثبت دریافت در قرنطینه</button>
    {message && <Notice tone="error">{message}</Notice>}
  </section>
  return <section className="sa-card" aria-label="بررسی سلامت کالای مرجوعی">
    <header className="sa-card-head"><h2>بررسی کالای مرجوعی</h2></header>
    {error && <Notice tone="error">{error}</Notice>}
    {!inspection ? <p role="status">در حال دریافت نتیجهٔ بررسی…</p> : inspection.status === 'DISPOSED' ? <ul className="rt-lines rt-inspection">{(inspection.segments || physical).map(line => <li key={`${line.line}:${line.disposition}`}><div><b>{line.name}</b>{line.variantName && <small>{line.variantName}</small>}<p>{line.disposition ? label[line.disposition] : 'بررسی شد'} · {line.quantity.toLocaleString('fa-IR')} عدد{line.note ? ` · ${line.note}` : ''}</p><small>مسئول بررسی: {line.actorId?.toLocaleString('fa-IR') || '—'}{line.inspectedAt ? ` · ${new Date(line.inspectedAt).toLocaleString('fa-IR')}` : ''}</small></div></li>)}</ul> : <form onSubmit={submit}>
      <p className="sa-hint">کالاها تا پایان بررسی قابل فروش نیستند. فقط تعداد سالم به انبار انتخاب‌شده می‌رود؛ کالای معیوب و ناقص در قرنطینه می‌ماند.</p>
      {locations.error && <Notice tone="error">{locations.error}</Notice>}
      <fieldset disabled={busy} className="gateway-controls"><legend className="sr-only">نتیجهٔ بررسی کالاها</legend>
        {physical.map(line => { const row = draft[line.line] || empty; return <fieldset className="sa-repeat" key={line.line}><legend>{line.name}{line.variantName ? ` · ${line.variantName}` : ''} · {line.quantity.toLocaleString('fa-IR')} عدد برگشتی</legend>
          <div className="sa-grid">{(['healthy', 'damaged', 'incomplete'] as const).map((key, index) => <label className="sa-field" key={key}><span>تعداد {label[outcomes[index]]}</span><input className="input" inputMode="numeric" dir="ltr" value={row[key]} onChange={event => patch(line.line, { [key]: event.target.value })} /></label>)}</div>
          <label className="sa-field"><span>انبار مقصد تعداد سالم</span><select className="select" aria-label="انبار مقصد تعداد سالم" value={row.destination} onChange={event => patch(line.line, { destination: event.target.value })}><option value="">انتخاب انبار</option>{locations.data?.locations.filter(location => location.active && !location.isQuarantine).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="sa-field"><span>شرح سلامت، نقص یا لوازم همراه</span><textarea className="input" rows={2} maxLength={500} value={row.note} onChange={event => patch(line.line, { note: event.target.value })} /></label>
        </fieldset> })}
        <button type="submit" className="btn" disabled={busy || !physical.length}>{busy ? 'در حال ثبت…' : 'ثبت نتیجهٔ بررسی و آزادسازی تعداد سالم'}</button>
      </fieldset>
    </form>}
    {message && <Notice tone="error">{message}</Notice>}
    {saved && <p role="status">نتیجهٔ بررسی و جابه‌جایی کالای سالم ثبت شد</p>}
  </section>
}
