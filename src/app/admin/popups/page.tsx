'use client'

import { useMemo, useState } from 'react'
import JalaliDateInput from '@/components/date/JalaliDateInput'
import { PopupBody } from '@/components/site/popups/PopupDialog'
import { POPUP_AUDIENCES, POPUP_DESIGNS, POPUP_EFFECTS, POPUP_KINDS, POPUP_POSITIONS, POPUP_REPEATS, POPUP_STATUS_LABEL, frequencyLabel } from '@/modules/popups/domain/popups'
import { ImageField } from '../ads/shared'
import { Notice, fa, send, useJson } from '../store/shared'
import './popups.css'

type Draft = {
  id?: number; title: string; body: string; kind: string; design: string; effect: string; position: string; image: string
  actionLabel: string; actionUrl: string; closeLabel: string; mustConfirm: boolean; status: string; startsAt: string; endsAt: string
  audience: string; groupIds: number[]; sections: string[]; repeatHours: number; maxViews: number; delaySeconds: number; pages: string; priority: number
}
type Row = Draft & { id: number; startsAt: string | null; endsAt: string | null; guestViews: number; memberViews: number; people: number; clicks: number }
type Data = { popups: Row[]; groups: { id: number; name: string; memberCount: number; automatic: string | null }[]; sections: { id: string; label: string }[] }

const EMPTY: Draft = { title: '', body: '', kind: 'NOTICE', design: 'seal', effect: 'rise', position: 'center', image: '', actionLabel: '', actionUrl: '', closeLabel: '', mustConfirm: false, status: 'DRAFT', startsAt: '', endsAt: '', audience: 'ALL', groupIds: [], sections: [], repeatHours: 24, maxViews: 0, delaySeconds: 2, pages: '', priority: 0 }
const TONE: Record<string, string> = { ACTIVE: 'is-ok', PAUSED: 'is-info', DRAFT: '' }

function Choice({ legend, options, value, onChange }: { legend: string; options: readonly { id: string; label: string; hint?: string }[]; value: string; onChange: (id: string) => void }) {
  return <fieldset className="pm-choice"><legend>{legend}</legend><div>{options.map((option) => <label key={option.id} className={value === option.id ? 'is-on' : ''} title={option.hint}><input type="radio" checked={value === option.id} onChange={() => onChange(option.id)} /><span>{option.label}</span></label>)}</div></fieldset>
}

function Chips<T extends string | number>({ legend, options, value, onChange }: { legend: string; options: { id: T; label: string }[]; value: T[]; onChange: (next: T[]) => void }) {
  return <fieldset className="pm-choice"><legend>{legend}</legend><div>{options.map((option) => <label key={String(option.id)} className={value.includes(option.id) ? 'is-on' : ''}><input type="checkbox" checked={value.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...value, option.id] : value.filter((id) => id !== option.id))} /><span>{option.label}</span></label>)}</div></fieldset>
}

export default function PopupsPage() {
  const { data, error, reload } = useJson<Data>('/api/admin/popups')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [replay, setReplay] = useState(0)

  const audienceName = useMemo(() => (row: Row) => {
    if (row.audience === 'GROUPS') return (data?.groups || []).filter((group) => row.groupIds.includes(group.id)).map((group) => group.name).join('، ') || 'گروه حذف‌شده'
    if (row.audience === 'SECTION_MANAGERS') return `مدیران ${(data?.sections || []).filter((section) => row.sections.includes(section.id)).map((section) => section.label).join('، ')}`
    return POPUP_AUDIENCES.find((item) => item.id === row.audience)?.label || row.audience
  }, [data])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))
  const fix = (next: Partial<Draft>) => { setDraft((current) => (current ? { ...current, ...next } : current)); setReplay((value) => value + 1) }

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true)
    const result = await send('/api/admin/popups', 'POST', body)
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: done } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
    return result.ok
  }
  async function save(status?: string) {
    if (!draft) return
    if (await run({ op: 'save', popup: { ...draft, status: status || draft.status } }, 'پاپ‌آپ ذخیره شد.')) setDraft(null)
  }
  const edit = (row: Row) => { setNotice(null); setDraft({ ...row, startsAt: row.startsAt || '', endsAt: row.endsAt || '' }); setReplay((value) => value + 1); window.scrollTo({ top: 0 }) }
  const remove = (row: Row) => { if (window.confirm(`پاپ‌آپ «${row.title}» حذف شود؟ آمار آن هم پاک می‌شود.`)) void run({ op: 'delete', id: row.id }, 'پاپ‌آپ حذف شد.') }
  const restart = (row: Row) => { if (window.confirm(`«${row.title}» دوباره به همه نشان داده شود؟ شمارش نمایش از صفر شروع می‌شود.`)) void run({ op: 'restart', id: row.id }, 'شمارش از نو شروع شد.') }

  const custom = draft && !POPUP_REPEATS.some((item) => item.hours === draft.repeatHours)
  const showing = draft && (draft.repeatHours > 0)

  return <div className="sa pm" dir="rtl">
    <header className="sa-head">
      <div><h1>پاپ‌آپ اطلاعیه</h1><p className="sa-hint">اطلاعیه، خبر یا هشدار مهم را برای گروهی که می‌خواهید و با تعداد نمایش دلخواه نشان دهید.</p></div>
      {!draft && <div className="sa-head-actions"><button type="button" className="btn btn-primary" onClick={() => { setNotice(null); setDraft({ ...EMPTY }); setReplay((value) => value + 1) }}>پاپ‌آپ تازه</button></div>}
    </header>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    {draft && <div className="pm-editor">
      <div className="pm-form">
        <section className="sa-card" aria-label="متن">
          <header className="sa-card-head"><h2>{draft.id ? 'ویرایش پاپ‌آپ' : 'پاپ‌آپ تازه'}</h2></header>
          <label className="sa-field"><span>عنوان *</span><input className="input" value={draft.title} maxLength={120} onChange={(event) => set('title', event.target.value)} /></label>
          <label className="sa-field"><span>متن</span><textarea className="input" rows={4} value={draft.body} maxLength={1200} onChange={(event) => set('body', event.target.value)} /></label>
          <div className="pm-row">
            <label className="sa-field"><span>متن دکمه</span><input className="input" value={draft.actionLabel} maxLength={40} placeholder="مثلاً مشاهدهٔ جزئیات" onChange={(event) => set('actionLabel', event.target.value)} /></label>
            <label className="sa-field"><span>نشانی دکمه</span><input className="input" dir="ltr" value={draft.actionUrl} placeholder="/products یا https://…" onChange={(event) => set('actionUrl', event.target.value)} /></label>
          </div>
          <label className="sa-field"><span>متن دکمهٔ بستن (اختیاری)</span><input className="input" value={draft.closeLabel} maxLength={40} placeholder="بعداً" onChange={(event) => set('closeLabel', event.target.value)} /></label>
          <label className="sa-check"><input type="checkbox" checked={draft.mustConfirm} onChange={(event) => set('mustConfirm', event.target.checked)} />کاربر باید دکمه را بزند؛ با کلیک بیرون پنجره بسته نشود</label>
        </section>

        <section className="sa-card" aria-label="ظاهر">
          <header className="sa-card-head"><h2>ظاهر و افکت</h2></header>
          <Choice legend="نوع پیام" options={POPUP_KINDS} value={draft.kind} onChange={(kind) => fix({ kind })} />
          <Choice legend="طرح" options={POPUP_DESIGNS} value={draft.design} onChange={(design) => fix({ design })} />
          {(draft.design === 'cover' || draft.design === 'split') && <ImageField label="تصویر *" value={draft.image} onChange={(image) => fix({ image })} />}
          <Choice legend="افکت ورود" options={POPUP_EFFECTS} value={draft.effect} onChange={(effect) => fix({ effect })} />
          <Choice legend="محل نمایش" options={POPUP_POSITIONS} value={draft.position} onChange={(position) => fix({ position })} />
        </section>

        <section className="sa-card" aria-label="مخاطب">
          <header className="sa-card-head"><h2>چه کسانی ببینند</h2></header>
          <Choice legend="مخاطب" options={POPUP_AUDIENCES} value={draft.audience} onChange={(audience) => set('audience', audience)} />
          {draft.audience === 'GROUPS' && <Chips legend="گروه‌ها" options={(data?.groups || []).map((group) => ({ id: group.id, label: `${group.name}${group.automatic ? '' : ` (${fa(group.memberCount)})`}` }))} value={draft.groupIds} onChange={(groupIds) => set('groupIds', groupIds)} />}
          {draft.audience === 'SECTION_MANAGERS' && <Chips legend="بخش‌ها" options={data?.sections || []} value={draft.sections} onChange={(sections) => set('sections', sections)} />}
          <label className="sa-field"><span>فقط در این صفحه‌ها (هر نشانی در یک خط؛ خالی یعنی همهٔ سایت)</span><textarea className="input" dir="ltr" rows={2} value={draft.pages} placeholder={'/\n/products'} onChange={(event) => set('pages', event.target.value)} /></label>
        </section>

        <section className="sa-card" aria-label="تکرار">
          <header className="sa-card-head"><h2>تعداد و زمان نمایش</h2></header>
          <fieldset className="pm-choice"><legend>برای هر کاربر</legend><div>
            {POPUP_REPEATS.map((item) => <label key={item.hours} className={draft.repeatHours === item.hours ? 'is-on' : ''}><input type="radio" checked={draft.repeatHours === item.hours} onChange={() => set('repeatHours', item.hours)} /><span>{item.label}</span></label>)}
            <label className={custom ? 'is-on' : ''}><input type="radio" checked={Boolean(custom)} onChange={() => set('repeatHours', 12)} /><span>سفارشی</span></label>
          </div></fieldset>
          <div className="pm-row">
            {custom && <label className="sa-field"><span>هر چند ساعت</span><input className="input" type="number" dir="ltr" min={1} max={8760} value={draft.repeatHours} onChange={(event) => set('repeatHours', Number(event.target.value) || 1)} /></label>}
            {showing && <label className="sa-field"><span>حداکثر تعداد نمایش به هر کاربر (۰ یعنی بدون سقف)</span><input className="input" type="number" dir="ltr" min={0} value={draft.maxViews} onChange={(event) => set('maxViews', Number(event.target.value) || 0)} /></label>}
            <label className="sa-field"><span>تأخیر پس از باز شدن صفحه (ثانیه)</span><input className="input" type="number" dir="ltr" min={0} max={120} value={draft.delaySeconds} onChange={(event) => set('delaySeconds', Number(event.target.value) || 0)} /></label>
            <label className="sa-field"><span>اولویت (عدد بزرگ‌تر زودتر نمایش داده می‌شود)</span><input className="input" type="number" dir="ltr" min={0} max={1000} value={draft.priority} onChange={(event) => set('priority', Number(event.target.value) || 0)} /></label>
          </div>
          <div className="pm-row">
            <label className="sa-field"><span>شروع (اختیاری)</span><JalaliDateInput withTime className="input" value={draft.startsAt} onChange={(startsAt) => set('startsAt', startsAt)} /></label>
            <label className="sa-field"><span>پایان (اختیاری)</span><JalaliDateInput withTime className="input" value={draft.endsAt} onChange={(endsAt) => set('endsAt', endsAt)} /></label>
          </div>
          <p className="sa-hint">{frequencyLabel(draft)}</p>
        </section>

        <div className="pm-save">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save('ACTIVE')}>ذخیره و انتشار</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save(draft.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT')}>{draft.status === 'ACTIVE' ? 'ذخیره' : 'ذخیرهٔ پیش‌نویس'}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDraft(null)}>انصراف</button>
        </div>
      </div>

      <aside className="pm-preview" aria-label="پیش‌نمایش">
        <div className="pm-preview-head"><h2>پیش‌نمایش</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplay((value) => value + 1)}>پخش دوبارهٔ افکت</button></div>
        <div className="pm-stage">
          <div key={replay} className={`spp spp-inline is-${draft.kind.toLowerCase()} look-${draft.design} at-center fx-${draft.effect}`} data-open="">
            <PopupBody popup={{ ...draft, title: draft.title || 'عنوان اطلاعیه', body: draft.body || 'متن اطلاعیه اینجا نمایش داده می‌شود.' }} />
          </div>
        </div>
      </aside>
    </div>}

    {!draft && <section className="sa-card" aria-label="فهرست پاپ‌آپ‌ها">
      {data && !data.popups.length && <div className="pm-empty"><h2>هنوز پاپ‌آپی نساخته‌اید</h2><p className="sa-hint">اولین اطلاعیه را بسازید و مخاطب و تعداد نمایشش را انتخاب کنید.</p></div>}
      {data && data.popups.length > 0 && <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>عنوان</th><th>مخاطب</th><th>تکرار</th><th>وضعیت</th><th>نمایش</th><th>افراد</th><th>کلیک</th><th><span className="sr-only">عملیات</span></th></tr></thead>
        <tbody>{data.popups.map((row) => <tr key={row.id}>
          <td><b>{row.title}</b></td>
          <td>{audienceName(row)}</td>
          <td>{frequencyLabel(row)}</td>
          <td><span className={`sa-state ${TONE[row.status] || ''}`}>{POPUP_STATUS_LABEL[row.status] || row.status}</span></td>
          <td className="num">{fa(row.memberViews + row.guestViews)}</td>
          <td className="num">{fa(row.people)}</td>
          <td className="num">{fa(row.clicks)}</td>
          <td><div className="pm-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(row)}>ویرایش</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run({ op: 'status', id: row.id, status: row.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }, row.status === 'ACTIVE' ? 'پاپ‌آپ متوقف شد.' : 'پاپ‌آپ فعال شد.')}>{row.status === 'ACTIVE' ? 'توقف' : 'فعال‌سازی'}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => restart(row)}>نمایش دوباره به همه</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(row)}>حذف</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}
  </div>
}
