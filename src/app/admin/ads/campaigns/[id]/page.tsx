'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { useParams, useRouter } from '@/platform/routing/navigation'
import { AdsShell, ImageField, Notice, StatusChip, Trend, fa, faDate, send, useJson, type Day } from '../../shared'

type Creative = { id: number; kind: string; title: string; imageUrl: string; imageMobileUrl: string; alt: string; linkUrl: string; html: string; text: string; cta: string; weight: number; active: boolean; impressions: number; clicks: number; ctr: number }
type Detail = {
  campaign: {
    id: number; name: string; status: string; priority: number; startsAt: string | null; endsAt: string | null; placements: string[]; devices: string; audience: string; includePaths: string[]; excludePaths: string[]; languages: string[]; hours: string
    maxImpressions: number; maxClicks: number; dailyImpressions: number; dailyClicks: number; note: string; rejectReason: string; approvedAt: string | null; paid: string; impressions: number; clicks: number; ctr: number
    advertiserId: number | null; advertiserInfo: { id: number; name: string; company: string; email: string; phone: string; userId: number | null } | null
  }
  creatives: Creative[]; series: Day[]; byPlacement: { key: string; impressions: number; clicks: number; ctr: number }[]
}
type Placement = { key: string; name: string; description: string; width: number; height: number; device: string; active: boolean }
type Form = { name: string; priority: number; startsAt: string; endsAt: string; placements: string[]; devices: string; audience: string; includePaths: string; excludePaths: string; languages: string; hours: string; maxImpressions: string; maxClicks: string; dailyImpressions: string; dailyClicks: string; note: string; advertiserId: string }
const EMPTY: Form = { name: '', priority: 5, startsAt: '', endsAt: '', placements: [], devices: 'ALL', audience: 'ALL', includePaths: '', excludePaths: '', languages: '', hours: '', maxImpressions: '', maxClicks: '', dailyImpressions: '', dailyClicks: '', note: '', advertiserId: '' }
const BLANK: Creative = { id: 0, kind: 'IMAGE', title: '', imageUrl: '', imageMobileUrl: '', alt: '', linkUrl: '', html: '', text: '', cta: '', weight: 1, active: true, impressions: 0, clicks: 0, ctr: 0 }

const local = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const numeric = (value: number) => (value ? String(value) : '')

function Preview({ item }: { item: Creative }) {
  if (item.kind === 'IMAGE') return item.imageUrl ? <img src={item.imageUrl} alt={item.alt || item.title} /> : <span className="sa-sub">تصویر ندارد</span>
  if (item.kind === 'TEXT') return <span className="promo-text"><b>{item.title || 'عنوان'}</b>{item.text && <span>{item.text}</span>}{item.cta && <em>{item.cta}</em>}</span>
  return <iframe title="پیش‌نمایش" srcDoc={item.html} sandbox="allow-scripts" style={{ width: '100%', height: 120, border: 0 }} />
}

function CreativeEditor({ campaignId, item, onSaved, onCancel }: { campaignId: number; item: Creative; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(item)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Creative>) => setForm((current) => ({ ...current, ...patch }))
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const result = await send('/api/admin/ads', 'POST', { op: 'creative.save', campaignId, ...form, id: form.id || undefined })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    onSaved()
  }
  return <form className="sa-card sa-form" onSubmit={(e) => void save(e)}>
    <header className="sa-card-head"><h2>{item.id ? 'ویرایش تبلیغ' : 'تبلیغ تازه'}</h2></header>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="sa-cols">
      <label className="sa-field"><span>نوع</span><select className="select" value={form.kind} onChange={(e) => set({ kind: e.target.value })}><option value="IMAGE">بنر تصویری</option><option value="TEXT">تبلیغ متنی</option><option value="HTML">کد HTML</option></select></label>
      <label className="sa-field"><span>عنوان (برای گزارش و متن جایگزین)</span><input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} /></label>
      <label className="sa-field"><span>وزن در چرخش (بیشتر = بیشتر نمایش)</span><input className="input" type="number" min={1} max={100} value={form.weight} onChange={(e) => set({ weight: Number(e.target.value) })} /><small className="sa-sub">چند تبلیغ در یک کمپین برای آزمایش A/B به‌نسبت وزن می‌چرخند.</small></label>
    </div>
    {form.kind === 'IMAGE' && <div className="sa-cols">
      <ImageField label="تصویر بنر *" value={form.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
      <ImageField label="تصویر مخصوص موبایل (اختیاری)" value={form.imageMobileUrl} onChange={(imageMobileUrl) => set({ imageMobileUrl })} />
      <label className="sa-field"><span>متن جایگزین تصویر</span><input className="input" value={form.alt} onChange={(e) => set({ alt: e.target.value })} maxLength={160} /></label>
    </div>}
    {form.kind === 'TEXT' && <div className="sa-cols">
      <label className="sa-field"><span>متن توضیح</span><textarea className="textarea" rows={3} value={form.text} onChange={(e) => set({ text: e.target.value })} maxLength={200} /></label>
      <label className="sa-field"><span>متن دکمه</span><input className="input" value={form.cta} onChange={(e) => set({ cta: e.target.value })} maxLength={40} placeholder="مشاهده" /></label>
    </div>}
    {form.kind === 'HTML' && <label className="sa-field"><span>کد HTML (داخل قاب امن نمایش داده می‌شود)</span><textarea className="textarea" dir="ltr" rows={7} value={form.html} onChange={(e) => set({ html: e.target.value })} />
      <small className="sa-sub">برای شمردن کلیک، نشانی مقصد را با <code dir="ltr">{'{{click_url}}'}</code> بنویسید: <code dir="ltr">{'<a href="{{click_url}}" target="_blank">…</a>'}</code>. اسکریپت‌های بیرونی (مثل شبکه‌های تبلیغاتی) مجاز نیستند.</small></label>}
    <label className="sa-field"><span>نشانی مقصد (با کلیک)</span><input className="input" dir="ltr" value={form.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} placeholder="https://example.com/landing" /></label>
    {form.kind !== 'HTML' && form.imageUrl && <div className="ad-creative-preview"><Preview item={form} /></div>}
    <label className="sa-check"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> <span>فعال باشد</span></label>
    <div className="sa-row-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : 'ذخیرهٔ تبلیغ'}</button><button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button></div>
  </form>
}

export default function CampaignEditor() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'
  const { data, error, reload } = useJson<Detail>(isNew ? null : `/api/admin/ads?view=campaign&id=${id}`)
  const places = useJson<{ placements: Placement[] }>('/api/admin/ads?view=placements')
  const advertisers = useJson<{ advertisers: { id: number; name: string; company: string }[] }>('/api/admin/ads?view=advertisers')
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Creative | null>(null)

  useEffect(() => {
    if (!data) return
    const c = data.campaign
    setForm({ name: c.name, priority: c.priority, startsAt: local(c.startsAt), endsAt: local(c.endsAt), placements: c.placements, devices: c.devices, audience: c.audience, includePaths: c.includePaths.join('\n'), excludePaths: c.excludePaths.join('\n'), languages: c.languages.join(', '), hours: c.hours, maxImpressions: numeric(c.maxImpressions), maxClicks: numeric(c.maxClicks), dailyImpressions: numeric(c.dailyImpressions), dailyClicks: numeric(c.dailyClicks), note: c.note, advertiserId: c.advertiserId ? String(c.advertiserId) : '' })
  }, [data])

  if (error) return <AdsShell title="کمپین"><Notice tone="error">{error}</Notice></AdsShell>
  if (!form || (!isNew && !data)) return <AdsShell title="کمپین"><div className="sa-skeleton" aria-busy="true" /></AdsShell>
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const campaign = data?.campaign
  const togglePlacement = (key: string) => set({ placements: form.placements.includes(key) ? form.placements.filter((item) => item !== key) : [...form.placements, key] })

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setBusy(true); setNotice(null)
    const payload = { ...form, id: isNew ? undefined : Number(id), startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '', endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '' }
    const result = await send<{ id: number }>('/api/admin/ads', 'POST', { op: 'campaign.save', ...payload })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    if (isNew) { router.replace(`/admin/ads/campaigns/${result.data.id}`); return }
    setNotice({ tone: 'ok', text: 'ذخیره شد.' }); void reload()
  }
  async function status(next: string, reason = '') {
    setBusy(true); setNotice(null)
    const result = await send('/api/admin/ads', 'POST', { op: 'campaign.status', id: Number(id), status: next, reason })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setNotice({ tone: 'ok', text: 'وضعیت کمپین تغییر کرد.' }); void reload()
  }
  async function removeCreative(creativeId: number) {
    if (!window.confirm('این تبلیغ حذف شود؟')) return
    const result = await send('/api/admin/ads', 'POST', { op: 'creative.delete', campaignId: Number(id), id: creativeId })
    if (result.ok) void reload(); else setNotice({ tone: 'error', text: result.error })
  }
  async function removeCampaign() {
    if (!window.confirm('کمپین حذف شود؟')) return
    const result = await send('/api/admin/ads', 'POST', { op: 'campaign.delete', id: Number(id) })
    if (result.ok) router.replace('/admin/ads/campaigns'); else setNotice({ tone: 'error', text: result.error })
  }

  const title = isNew ? 'کمپین تازه' : campaign?.name || 'کمپین'
  return <AdsShell title={title} actions={<>{campaign && <StatusChip status={campaign.status} />}<Link href="/admin/ads/campaigns" className="btn btn-ghost">بازگشت</Link></>}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {campaign?.status === 'REJECTED' && <Notice tone="error">ردشده: {campaign.rejectReason}</Notice>}
    {campaign && <div className="ad-decision">
      <b>وضعیت:</b>
      {campaign.status === 'PENDING' && <><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void status('ACTIVE')}>تأیید و فعال‌سازی</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { const reason = window.prompt('دلیل رد:') || ''; if (reason.trim()) void status('REJECTED', reason) }}>رد</button></>}
      {['DRAFT', 'PAUSED', 'ENDED'].includes(campaign.status) && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void status('ACTIVE')}>{campaign.status === 'ENDED' ? 'فعال‌سازی دوباره' : 'فعال‌سازی'}</button>}
      {campaign.status === 'ACTIVE' && <><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void status('PAUSED')}>توقف</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void status('ENDED')}>پایان کمپین</button></>}
      {campaign.paid && <span className="sa-sub">پرداخت‌شده: {campaign.paid}</span>}
      {campaign.advertiserInfo && <span className="sa-sub">تبلیغ‌دهنده: {campaign.advertiserInfo.company || campaign.advertiserInfo.name}{campaign.advertiserInfo.phone ? ` · ${campaign.advertiserInfo.phone}` : ''}</span>}
      <button type="button" className="sa-link" style={{ marginInlineStart: 'auto' }} onClick={() => void removeCampaign()}>حذف کمپین</button>
    </div>}

    <form className="sa-card sa-form" onSubmit={(e) => void save(e)}>
      <header className="sa-card-head"><h2>مشخصات</h2></header>
      <div className="sa-cols">
        <label className="sa-field"><span>نام کمپین *</span><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} /></label>
        <label className="sa-field"><span>تبلیغ‌دهنده</span><select className="select" value={form.advertiserId} onChange={(e) => set({ advertiserId: e.target.value })} disabled={!isNew}><option value="">— (تبلیغ خود سایت)</option>{advertisers.data?.advertisers.map((row) => <option key={row.id} value={row.id}>{row.company || row.name}</option>)}</select></label>
        <label className="sa-field"><span>اولویت (۱ تا ۱۰)</span><input className="input" type="number" min={1} max={10} value={form.priority} onChange={(e) => set({ priority: Number(e.target.value) })} /><small className="sa-sub">در هر جایگاه، اولویت بالاتر اول نمایش داده می‌شود؛ هم‌اولویت‌ها به‌نوبت.</small></label>
      </div>

      <fieldset className="ad-fieldset"><legend>جایگاه‌ها *</legend>
        <div className="ad-place-grid">{places.data?.placements.map((place) => <label key={place.key} className={`ad-place${form.placements.includes(place.key) ? ' is-on' : ''}`}>
          <input type="checkbox" checked={form.placements.includes(place.key)} onChange={() => togglePlacement(place.key)} /><b>{place.name}</b><small>{place.width ? `${fa(place.width)}×${fa(place.height)}` : 'اندازهٔ آزاد'}{place.active ? '' : ' · غیرفعال'}</small>
        </label>)}</div>
      </fieldset>

      <div className="sa-cols">
        <label className="sa-field"><span>شروع</span><input className="input" type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></label>
        <label className="sa-field"><span>پایان</span><input className="input" type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></label>
        <label className="sa-field"><span>ساعات نمایش (به وقت تهران)</span><input className="input" dir="ltr" value={form.hours} onChange={(e) => set({ hours: e.target.value })} placeholder="9-23" /><small className="sa-sub">خالی = همهٔ ساعت‌ها. برای شب‌ها: 22-6</small></label>
      </div>
      <div className="sa-cols">
        <label className="sa-field"><span>دستگاه</span><select className="select" value={form.devices} onChange={(e) => set({ devices: e.target.value })}><option value="ALL">همه</option><option value="DESKTOP">رایانه</option><option value="MOBILE">موبایل</option></select></label>
        <label className="sa-field"><span>مخاطب</span><select className="select" value={form.audience} onChange={(e) => set({ audience: e.target.value })}><option value="ALL">همه</option><option value="GUEST">فقط مهمان‌ها</option><option value="MEMBER">فقط کاربران واردشده</option><option data-vip="" value="NON_VIP">همه به‌جز اعضای VIP</option></select></label>
        <label className="sa-field"><span>زبان‌ها (خالی = همه)</span><input className="input" dir="ltr" value={form.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="fa, en" /></label>
      </div>
      <div className="sa-cols">
        <label className="sa-field"><span>فقط در این صفحه‌ها (هر مسیر در یک خط)</span><textarea className="textarea" dir="ltr" rows={3} value={form.includePaths} onChange={(e) => set({ includePaths: e.target.value })} placeholder={'/software\n/blog/tech'} /><small className="sa-sub">خالی = همهٔ صفحه‌ها. مسیر و زیرمسیرهایش.</small></label>
        <label className="sa-field"><span>نمایش داده نشود در</span><textarea className="textarea" dir="ltr" rows={3} value={form.excludePaths} onChange={(e) => set({ excludePaths: e.target.value })} placeholder="/software/browse" /></label>
      </div>
      <div className="sa-cols">
        <label className="sa-field"><span>سقف کل نمایش (خالی = نامحدود)</span><input className="input" type="number" min={0} value={form.maxImpressions} onChange={(e) => set({ maxImpressions: e.target.value })} /></label>
        <label className="sa-field"><span>سقف کل کلیک</span><input className="input" type="number" min={0} value={form.maxClicks} onChange={(e) => set({ maxClicks: e.target.value })} /></label>
        <label className="sa-field"><span>سقف نمایش روزانه</span><input className="input" type="number" min={0} value={form.dailyImpressions} onChange={(e) => set({ dailyImpressions: e.target.value })} /></label>
        <label className="sa-field"><span>سقف کلیک روزانه</span><input className="input" type="number" min={0} value={form.dailyClicks} onChange={(e) => set({ dailyClicks: e.target.value })} /></label>
      </div>
      <label className="sa-field"><span>یادداشت داخلی</span><input className="input" value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} /></label>
      <div className="sa-row-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : isNew ? 'ساخت کمپین' : 'ذخیرهٔ تغییرات'}</button></div>
    </form>

    {campaign && data && <>
      <section className="sa-card">
        <header className="sa-card-head"><h2>تبلیغ‌ها</h2><button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ ...BLANK })}>+ تبلیغ تازه</button></header>
        {editing && <CreativeEditor campaignId={campaign.id} item={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />}
        <div className="sa-stack">
          {data.creatives.map((item) => <div key={item.id} className={`ad-creative${item.active ? '' : ' is-off'}`}>
            <div className="ad-creative-preview"><Preview item={item} /></div>
            <div>
              <b>{item.title || (item.kind === 'IMAGE' ? 'بنر' : item.kind === 'TEXT' ? 'تبلیغ متنی' : 'کد HTML')}</b> <small className="sa-sub">وزن {fa(item.weight)}{item.active ? '' : ' · غیرفعال'}</small>
              <p className="sa-sub" dir="ltr">{item.linkUrl || '—'}</p>
              <p className="sa-sub">{fa(item.impressions)} نمایش · {fa(item.clicks)} کلیک · نرخ کلیک {item.ctr.toLocaleString('fa-IR')}٪</p>
              <div className="sa-row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(item)}>ویرایش</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => void removeCreative(item.id)}>حذف</button></div>
            </div>
          </div>)}
          {!data.creatives.length && <p className="sa-empty">هنوز تبلیغی (بنر یا متن) اضافه نشده است؛ بدون آن کمپین فعال نمی‌شود.</p>}
        </div>
      </section>

      <section className="sa-card">
        <header className="sa-card-head"><h2>نتایج</h2><a className="btn btn-ghost btn-sm" href={`/api/admin/ads?view=csv&id=${campaign.id}`}>دریافت گزارش CSV</a></header>
        <div className="sa-kpis">
          <div className="sa-kpi"><small>نمایش</small><b className="num">{fa(campaign.impressions)}</b></div>
          <div className="sa-kpi"><small>کلیک</small><b className="num">{fa(campaign.clicks)}</b></div>
          <div className="sa-kpi"><small>نرخ کلیک</small><b className="num">{campaign.ctr.toLocaleString('fa-IR')}٪</b></div>
          {campaign.approvedAt && <div className="sa-kpi"><small>تأیید</small><b>{faDate(campaign.approvedAt)}</b></div>}
        </div>
        <div className="ad-charts"><Trend title="نمایش روزانه" data={data.series} field="impressions" unit="نمایش" /><Trend title="کلیک روزانه" data={data.series} field="clicks" unit="کلیک" /></div>
        {data.byPlacement.length > 0 && <table className="data sa-table"><thead><tr><th>جایگاه</th><th>نمایش</th><th>کلیک</th><th>نرخ کلیک</th></tr></thead><tbody>{data.byPlacement.map((row) => <tr key={row.key}><td dir="ltr">{row.key}</td><td className="num">{fa(row.impressions)}</td><td className="num">{fa(row.clicks)}</td><td className="num">{row.ctr.toLocaleString('fa-IR')}٪</td></tr>)}</tbody></table>}
      </section>
    </>}
  </AdsShell>
}
