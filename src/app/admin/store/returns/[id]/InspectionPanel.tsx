'use client'

import { useState } from 'react'
import { Notice, send, useJson } from '../../shared'
import { latinDigits } from '@/shared/text/digits'

type Disposition = 'HEALTHY' | 'DAMAGED' | 'INCOMPLETE'
type Line = { line: number; quantity: number; name: string; variantName: string }
type Segment = Line & { disposition?: Disposition; approvedQuantity?: number; actorId?: number; inspectedAt?: string; note?: string }
type Custody = { id: number; segmentIndex: number; quantity: number; resolution: string; status: string; formSubmissionId: number | null; form: { id: number; stage: string; status: string; title: string; slug: string } | null; destinationLocationId: number | null; destinationName: string; note: string; confirmedAt: string; releasedAt: string | null; updatedAt: string }
type View = { lines: Line[]; inspection: { status: string; updatedAt: string; canReceive: boolean; lines: Segment[]; segments?: Segment[]; custodyResolutions: Custody[] } }
const label: Record<Disposition, string> = { HEALTHY: 'سالم', DAMAGED: 'معیوب', INCOMPLETE: 'ناقص' }
const outcomes: Disposition[] = ['HEALTHY', 'DAMAGED', 'INCOMPLETE']
type Draft = { healthy: string; damaged: string; incomplete: string; destination: string; note: string }
type CustodyDraft = { action: 'REPAIR' | 'SUPPLIER_RETURN' | 'SCRAP' | 'RESTOCK'; formSubmissionId: string; destinationLocationId: string; identityConfirmed: boolean; healthConfirmed: boolean; physicalReleaseConfirmed: boolean; note: string }
const empty: Draft = { healthy: '0', damaged: '0', incomplete: '0', destination: '', note: '' }
const emptyCustody: CustodyDraft = { action: 'REPAIR', formSubmissionId: '', destinationLocationId: '', identityConfirmed: false, healthConfirmed: false, physicalReleaseConfirmed: false, note: '' }
const quantity = (value: string) => /^\d+$/.test(latinDigits(value)) ? Number(latinDigits(value)) : -1

export default function InspectionPanel({ returnId, onChanged }: { returnId: number; onChanged: () => void }) {
  const { data, error, reload } = useJson<View>(`/api/admin/store/returns/${returnId}`)
  const locations = useJson<{ locations: { id: number; name: string; active: boolean; isQuarantine: boolean }[] }>('/api/admin/store/stock?locations=1')
  const [draft, setDraft] = useState<Record<number, Draft>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const [received, setReceived] = useState(false)
  const [custodyDrafts, setCustodyDrafts] = useState<Record<number, CustodyDraft>>({})
  const inspection = data?.inspection
  const physical = inspection?.lines || []
  const patch = (line: number, value: Partial<Draft>) => { setDraft(current => ({ ...current, [line]: { ...empty, ...current[line], ...value } })); setSaved(false) }
  const patchCustody = (index: number, value: Partial<CustodyDraft>) => setCustodyDrafts(current => ({ ...current, [index]: { ...emptyCustody, ...current[index], ...value } }))
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
  async function resolveCustody(segmentIndex: number, segment: Segment) {
    if (!inspection || busy) return
    const current = inspection.custodyResolutions?.find(row => row.segmentIndex === segmentIndex)
    const draft = custodyDrafts[segmentIndex] || { ...emptyCustody, action: current ? 'RESTOCK' : 'REPAIR' }
    const action = draft.action
    if (action === 'REPAIR' && (!Number.isSafeInteger(Number(draft.formSubmissionId)) || Number(draft.formSubmissionId) <= 0 || !draft.identityConfirmed)) { setMessage('شمارهٔ درخواست تعمیر و تأیید هویت فیزیکی دستگاه را وارد کنید'); return }
    if (action === 'RESTOCK' && (!draft.destinationLocationId || !draft.healthConfirmed)) { setMessage('انبار مقصد و تأیید سلامت پس از تعمیر را ثبت کنید'); return }
    if ((action === 'SUPPLIER_RETURN' || action === 'SCRAP') && !draft.physicalReleaseConfirmed) { setMessage('تأیید خروج فیزیکی این تعداد کالا را ثبت کنید'); return }
    setBusy(true); setMessage('')
    try {
      const response = await send(`/api/admin/store/returns/${returnId}/custody`, 'POST', {
        segmentIndex, action, expectedUpdatedAt: current?.updatedAt || inspection.updatedAt, note: draft.note,
        ...(action === 'REPAIR' ? { formSubmissionId: Number(draft.formSubmissionId), identityConfirmed: draft.identityConfirmed } : {}),
        ...(action === 'RESTOCK' ? { destinationLocationId: Number(draft.destinationLocationId), healthConfirmed: draft.healthConfirmed } : {}),
        ...((action === 'SUPPLIER_RETURN' || action === 'SCRAP') ? { physicalReleaseConfirmed: draft.physicalReleaseConfirmed } : {}),
      })
      if (!response.ok) { setMessage(response.error); return }
      setCustodyDrafts(currentDrafts => { const next = { ...currentDrafts }; delete next[segmentIndex]; return next })
      await reload(); onChanged()
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
    {!inspection ? <p role="status">در حال دریافت نتیجهٔ بررسی…</p> : inspection.status === 'DISPOSED' ? <>
      <ul className="rt-lines rt-inspection">{(inspection.segments || physical).map((line, index) => <li key={`${index}:${line.line}:${line.disposition}`}><div><b>{line.name}</b>{line.variantName && <small>{line.variantName}</small>}<p>{line.disposition ? label[line.disposition] : 'بررسی شد'} · {line.quantity.toLocaleString('fa-IR')} عدد{line.note ? ` · ${line.note}` : ''}</p><small>مسئول بررسی: {line.actorId?.toLocaleString('fa-IR') || '—'}{line.inspectedAt ? ` · ${new Date(line.inspectedAt).toLocaleString('fa-IR')}` : ''}</small></div></li>)}</ul>
      <section className="sa-stack" aria-label="تعیین تکلیف کالای آسیب‌دیده یا ناقص">
        <h3>تعیین تکلیف کالای آسیب‌دیده یا ناقص</h3>
        <p className="sa-hint">تعدادهای هر بخش یک گروه از همان ردیف فروش هستند. برای تعمیر، درخواست Forms را با مشتری و کالای درست وصل کنید و شناسهٔ فیزیکی هر واحد را پیش از ثبت بررسی کنید. هیچ‌یک از این تصمیم‌ها بازپرداخت تازه‌ای ایجاد نمی‌کند.</p>
        {(inspection.segments || []).map((segment, segmentIndex) => {
          if (!segment.disposition || segment.disposition === 'HEALTHY') return null
          const current = inspection.custodyResolutions?.find(row => row.segmentIndex === segmentIndex)
          const draft = custodyDrafts[segmentIndex] || { ...emptyCustody, action: current ? 'RESTOCK' : 'REPAIR' }
          if (current && current.status !== 'REPAIR') return <article className="sa-repeat" key={segmentIndex}><b>{segment.name} · {label[segment.disposition]} · {segment.quantity.toLocaleString('fa-IR')} عدد</b><p>تعیین تکلیف نهایی: {current.status === 'RESTOCKED' ? `بازگشت سالم به ${current.destinationName}` : current.status === 'SUPPLIER_RETURN' ? 'بازگشت به تأمین‌کننده' : 'اسقاط'}</p><small>{current.releasedAt ? new Date(current.releasedAt).toLocaleString('fa-IR') : ''}{current.note ? ` · ${current.note}` : ''}</small></article>
          return <article className="sa-repeat" key={segmentIndex}>
            <header className="sa-card-head"><div><b>{segment.name}{segment.variantName ? ` · ${segment.variantName}` : ''}</b><small>{label[segment.disposition]} · {segment.quantity.toLocaleString('fa-IR')} عدد در قرنطینه</small></div><span className="sa-tag">{current?.status === 'REPAIR' ? 'در تعمیر' : 'در انتظار تصمیم'}</span></header>
            {current?.form && <p>درخواست تعمیر #{current.form.id} · {current.form.title} · {current.form.stage || current.form.status}</p>}
            {!current && <label className="sa-field"><span>تصمیم مدیر برای این تعداد</span><select className="select" aria-label="تصمیم مدیر برای این تعداد" value={draft.action} onChange={event => patchCustody(segmentIndex, { action: event.target.value as CustodyDraft['action'] })}><option value="REPAIR">ارجاع به تعمیر</option><option value="SUPPLIER_RETURN">بازگشت فیزیکی به تأمین‌کننده</option><option value="SCRAP">اسقاط و خروج فیزیکی</option></select></label>}
            {current?.status === 'REPAIR' && <label className="sa-field"><span>تصمیم نهایی پس از تعمیر</span><select className="select" aria-label="تصمیم مدیر برای این تعداد" value={draft.action} onChange={event => patchCustody(segmentIndex, { action: event.target.value as CustodyDraft['action'] })}><option value="RESTOCK">تأیید سلامت و بازگشت به انبار</option><option value="SUPPLIER_RETURN">بازگشت فیزیکی به تأمین‌کننده</option><option value="SCRAP">اسقاط و خروج فیزیکی</option></select></label>}
            {draft.action === 'REPAIR' && <><label className="sa-field"><span>شمارهٔ درخواست تعمیر موجود در Forms</span><input className="input" type="number" min="1" step="1" inputMode="numeric" value={draft.formSubmissionId} onChange={event => patchCustody(segmentIndex, { formSubmissionId: event.target.value })} /></label><label className="sa-check"><input type="checkbox" checked={draft.identityConfirmed} onChange={event => patchCustody(segmentIndex, { identityConfirmed: event.target.checked })} />مشتری و کالای فرم تعمیر را بررسی کردم و شناسهٔ فیزیکی هر واحد این بخش را حضوری تطبیق دادم</label></>}
            {draft.action === 'RESTOCK' && <><label className="sa-field"><span>انبار مقصد فروش‌پذیر</span><select className="select" aria-label="انبار مقصد فروش‌پذیر" value={draft.destinationLocationId} onChange={event => patchCustody(segmentIndex, { destinationLocationId: event.target.value })}><option value="">انتخاب انبار</option>{locations.data?.locations.filter(location => location.active && !location.isQuarantine).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="sa-check"><input type="checkbox" checked={draft.healthConfirmed} onChange={event => patchCustody(segmentIndex, { healthConfirmed: event.target.checked })} />درخواست Forms تکمیل شده و من سلامت فیزیکی تمام {segment.quantity.toLocaleString('fa-IR')} واحد این بخش را بررسی کردم</label></>}
            {(draft.action === 'SUPPLIER_RETURN' || draft.action === 'SCRAP') && <label className="sa-check"><input type="checkbox" checked={draft.physicalReleaseConfirmed} onChange={event => patchCustody(segmentIndex, { physicalReleaseConfirmed: event.target.checked })} />خروج فیزیکی تمام {segment.quantity.toLocaleString('fa-IR')} واحد از قرنطینه را تأیید می‌کنم</label>}
            <label className="sa-field"><span>یادداشت تصمیم مدیر</span><textarea className="input" rows={2} maxLength={300} value={draft.note} onChange={event => patchCustody(segmentIndex, { note: event.target.value })} /></label>
            <button type="button" className="btn" disabled={busy} onClick={() => void resolveCustody(segmentIndex, segment)}>{busy ? 'در حال ثبت…' : current ? 'ثبت تصمیم نهایی' : 'ثبت تصمیم و حرکت موجودی'}</button>
          </article>
        })}
      </section>
    </> : <form onSubmit={submit}>
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
