'use client'

import { useState } from 'react'
import { FULFILLMENT, HOSTING_CYCLES, HOSTING_KINDS, cyclesFor, kindMeta } from '@/modules/hosting/domain/catalog'
import { Notice, fa, send, useJson } from '../store/shared'
import { HostingShell, toman, type AdminProduct, type HostingData } from './shared'

type Draft = Omit<AdminProduct, 'id' | 'features'> & { id?: number; features: string }

const EMPTY: Draft = {
  slug: '', name: '', tagline: '', description: '', kind: 'SHARED', fulfillment: 'MANUAL', providerId: null, providerPlan: '',
  cpuCores: 0, ramMb: 0, diskGb: 0, diskType: 'NVMe', trafficGb: 0, bandwidthMbps: 0, sites: 0, mailboxes: 0, databases: 0, ipv4: 0,
  location: '', features: '', allowTraffic: false, trafficPackGb: 0, trafficPackMinor: '0', allowUpgrade: false, stoppedHourlyMinor: '0',
  active: true, featured: false, sort: 0, prices: [],
}

function NumberField({ label, value, onChange, hint }: { label: string; value: number | string; onChange: (value: string) => void; hint?: string }) {
  return <label className="sa-field"><span>{label}</span><input className="input" inputMode="numeric" dir="ltr" value={String(value)} onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ''))} />{hint && <small className="sa-hint">{hint}</small>}</label>
}

const specLine = (row: AdminProduct) => [
  row.cpuCores ? `${fa(row.cpuCores)} هسته` : '',
  row.ramMb ? `${fa(row.ramMb >= 1024 ? row.ramMb / 1024 : row.ramMb)} ${row.ramMb >= 1024 ? 'گیگ' : 'مگ'} رم` : '',
  row.diskGb ? `${fa(row.diskGb)} گیگ ${row.diskType}` : '',
  row.sites ? `${fa(row.sites)} سایت` : '',
].filter(Boolean).join(' · ')

export default function HostingProductsPage() {
  const { data, error, reload } = useJson<HostingData>('/api/admin/hosting')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true)
    const result = await send('/api/admin/hosting', 'POST', body)
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: done } : { tone: 'error', text: result.error })
    if (result.ok) void reload()
    return result.ok
  }
  async function save() {
    if (!draft) return
    const product = { ...draft, features: draft.features.split('\n') }
    if (await run({ op: 'save-product', product }, 'محصول ذخیره شد.')) setDraft(null)
  }
  const edit = (row: AdminProduct) => { setNotice(null); setDraft({ ...row, features: row.features.join('\n') }); window.scrollTo({ top: 0 }) }
  const remove = (row: AdminProduct) => { if (window.confirm(`محصول «${row.name}» حذف شود؟`)) void run({ op: 'delete-product', id: row.id }, 'محصول حذف شد.') }

  const price = (cycle: string) => draft?.prices.find((line) => line.cycle === cycle)
  const setPrice = (cycle: string, key: 'amountMinor' | 'setupMinor', value: string) => setDraft((current) => {
    if (!current) return current
    const others = current.prices.filter((line) => line.cycle !== cycle)
    const line = { cycle, currency: 'IRT', amountMinor: '0', setupMinor: '0', ...price(cycle), [key]: value || '0' }
    return { ...current, prices: [...others, line] }
  })
  const monthly = Number(price('MONTH')?.amountMinor || 0)
  const meta = draft ? kindMeta(draft.kind) : undefined
  const providers = (data?.providers || []).filter((provider) => provider.family === meta?.family)
  const server = meta?.family === 'COMPUTE'

  return <HostingShell
    title="میزبانی و سرور"
    hint="هاست، نمایندگی، سرور مجازی و اختصاصی و سرویس ابری؛ قیمت هر دوره و روش تحویل هر محصول."
    actions={!draft && <button type="button" className="btn btn-primary" onClick={() => { setNotice(null); setDraft({ ...EMPTY }) }}>محصول تازه</button>}
  >
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    {draft && <div className="hx-form">
      <section className="sa-card" aria-label="مشخصات">
        <header className="sa-card-head"><h2>{draft.id ? 'ویرایش محصول' : 'محصول تازه'}</h2></header>
        <fieldset className="hx-choice"><legend>نوع</legend><div>
          {HOSTING_KINDS.map((kind) => <label key={kind.id} className={draft.kind === kind.id ? 'is-on' : ''}><input type="radio" name="kind" checked={draft.kind === kind.id} onChange={() => setDraft({ ...draft, kind: kind.id, providerId: null, prices: draft.prices.filter((line) => cyclesFor(kind.id).includes(line.cycle as never)) })} /><span>{kind.label}</span>{kind.hourly && <small>ساعتی و دوره‌ای</small>}</label>)}
        </div></fieldset>
        <div className="hx-row">
          <label className="sa-field"><span>نام *</span><input className="input" value={draft.name} maxLength={120} onChange={(event) => set('name', event.target.value)} /></label>
          <label className="sa-field"><span>نامک (لاتین) *</span><input className="input" dir="ltr" value={draft.slug} maxLength={80} placeholder="vps-pro-4" onChange={(event) => set('slug', event.target.value.toLowerCase())} /></label>
        </div>
        <label className="sa-field"><span>یک خط معرفی</span><input className="input" value={draft.tagline} maxLength={160} onChange={(event) => set('tagline', event.target.value)} /></label>
        <label className="sa-field"><span>توضیح</span><textarea className="input" rows={3} value={draft.description} maxLength={4000} onChange={(event) => set('description', event.target.value)} /></label>
        <label className="sa-field"><span>ویژگی‌های برجسته (هر کدام در یک خط، حداکثر ۱۲)</span><textarea className="input" rows={4} value={draft.features} onChange={(event) => set('features', event.target.value)} /></label>
      </section>

      <section className="sa-card" aria-label="منابع">
        <header className="sa-card-head"><h2>منابع</h2></header>
        <div className="hx-row">
          {server && <NumberField label="هستهٔ پردازنده" value={draft.cpuCores} onChange={(value) => set('cpuCores', Number(value))} />}
          {server && <NumberField label="رم (مگابایت)" value={draft.ramMb} hint="۱۰۲۴ = یک گیگ" onChange={(value) => set('ramMb', Number(value))} />}
          <NumberField label="فضای دیسک (گیگابایت)" value={draft.diskGb} onChange={(value) => set('diskGb', Number(value))} />
          <label className="sa-field"><span>نوع دیسک</span><input className="input" dir="ltr" value={draft.diskType} maxLength={20} onChange={(event) => set('diskType', event.target.value)} /></label>
          <NumberField label="ترافیک ماهانه (گیگابایت، ۰ = نامحدود)" value={draft.trafficGb} onChange={(value) => set('trafficGb', Number(value))} />
          {server && <NumberField label="پهنای باند (Mbps)" value={draft.bandwidthMbps} onChange={(value) => set('bandwidthMbps', Number(value))} />}
          {server && <NumberField label="آی‌پی نسخهٔ ۴" value={draft.ipv4} onChange={(value) => set('ipv4', Number(value))} />}
          {!server && <NumberField label="تعداد سایت (۰ = نامحدود)" value={draft.sites} onChange={(value) => set('sites', Number(value))} />}
          {!server && <NumberField label="صندوق ایمیل" value={draft.mailboxes} onChange={(value) => set('mailboxes', Number(value))} />}
          {!server && <NumberField label="پایگاه داده" value={draft.databases} onChange={(value) => set('databases', Number(value))} />}
          <label className="sa-field"><span>محل سرور</span><input className="input" value={draft.location} maxLength={80} placeholder="مثلاً آلمان، فالکن‌اشتاین" onChange={(event) => set('location', event.target.value)} /></label>
        </div>
      </section>

      <section className="sa-card" aria-label="تحویل">
        <header className="sa-card-head"><h2>تحویل</h2></header>
        <fieldset className="hx-choice"><legend>روش تحویل</legend><div>
          {FULFILLMENT.map((item) => <label key={item.id} className={draft.fulfillment === item.id ? 'is-on' : ''} title={item.hint}><input type="radio" name="fulfillment" checked={draft.fulfillment === item.id} onChange={() => set('fulfillment', item.id)} /><span>{item.label}</span><small>{item.hint}</small></label>)}
        </div></fieldset>
        {draft.fulfillment === 'DRIVER' && <div className="hx-row">
          <label className="sa-field"><span>سامانهٔ متصل *</span><select className="input" value={draft.providerId || ''} onChange={(event) => set('providerId', Number(event.target.value) || null)}>
            <option value="">انتخاب کنید</option>
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.active ? '' : ' (غیرفعال)'}</option>)}
          </select>{!providers.length && <small className="sa-hint">هنوز سامانه‌ای از این نوع وصل نشده است؛ از «سامانه‌های متصل» اضافه کنید.</small>}</label>
          <label className="sa-field"><span>{server ? 'نوع سرور یا قالب روی سامانه' : 'نام پکیج روی کنترل‌پنل'}</span><input className="input" dir="ltr" value={draft.providerPlan} maxLength={120} placeholder={server ? 'cx22' : 'starter'} onChange={(event) => set('providerPlan', event.target.value)} /></label>
        </div>}
        {draft.fulfillment === 'MANUAL' && <>
          <p className="sa-hint">مشتری فقط IP، نام کاربری و رمز را می‌بیند. خرید ترافیک یا ارتقا فقط وقتی هست که اینجا روشن کنید؛ برای هر سرویس هم جدا قابل تغییر است.</p>
          <label className="sa-check"><input type="checkbox" checked={draft.allowTraffic} onChange={(event) => set('allowTraffic', event.target.checked)} />مشتری بتواند ترافیک اضافه بخرد</label>
          {draft.allowTraffic && <div className="hx-row">
            <NumberField label="حجم هر بسته (گیگابایت)" value={draft.trafficPackGb} onChange={(value) => set('trafficPackGb', Number(value))} />
            <NumberField label="قیمت هر بسته (تومان)" value={draft.trafficPackMinor} hint={toman(draft.trafficPackMinor)} onChange={(value) => set('trafficPackMinor', value || '0')} />
          </div>}
          <label className="sa-check"><input type="checkbox" checked={draft.allowUpgrade} onChange={(event) => set('allowUpgrade', event.target.checked)} />مشتری بتواند به پلن بالاتر ارتقا دهد</label>
        </>}
      </section>

      <section className="sa-card" aria-label="قیمت‌ها">
        <header className="sa-card-head"><h2>قیمت هر دوره</h2></header>
        <p className="sa-hint">به تومان. دوره‌ای که قیمت ندارد فروخته نمی‌شود. {meta?.hourly ? 'قیمت ساعتی از کیف پول مشتری کم می‌شود.' : ''}</p>
        <table className="hx-prices">
          <thead><tr><th>دوره</th><th>قیمت</th><th>هزینهٔ راه‌اندازی</th><th>نسبت به ماهانه</th></tr></thead>
          <tbody>{HOSTING_CYCLES.filter((cycle) => cyclesFor(draft.kind).includes(cycle.id)).map((cycle) => {
            const line = price(cycle.id)
            const amount = Number(line?.amountMinor || 0)
            const full = monthly * cycle.months
            const saving = cycle.months > 1 && monthly && amount && amount < full ? Math.floor(((full - amount) * 100) / full) : 0
            return <tr key={cycle.id}>
              <td>{cycle.label}</td>
              <td><input className="input" inputMode="numeric" dir="ltr" aria-label={`قیمت ${cycle.label}`} value={line?.amountMinor === '0' ? '' : line?.amountMinor || ''} placeholder="—" onChange={(event) => setPrice(cycle.id, 'amountMinor', event.target.value.replace(/[^\d]/g, ''))} /></td>
              <td><input className="input" inputMode="numeric" dir="ltr" aria-label={`راه‌اندازی ${cycle.label}`} value={line?.setupMinor === '0' ? '' : line?.setupMinor || ''} placeholder="۰" onChange={(event) => setPrice(cycle.id, 'setupMinor', event.target.value.replace(/[^\d]/g, ''))} /></td>
              <td>{cycle.id === 'HOURLY' && amount ? <span className="hx-spec">ماهانه حدود {toman(amount * 730)}</span> : saving ? <span className="hx-saving">{fa(saving)}٪ صرفه‌جویی</span> : <span className="hx-spec">—</span>}</td>
            </tr>
          })}</tbody>
        </table>
        {meta?.hourly && <NumberField label="هزینهٔ ساعتی سرور خاموش (دیسک و آی‌پی، تومان)" value={draft.stoppedHourlyMinor} hint="وقتی سرور خاموش است همین مبلغ هر ساعت کم می‌شود." onChange={(value) => set('stoppedHourlyMinor', value || '0')} />}
      </section>

      <section className="sa-card" aria-label="نمایش">
        <header className="sa-card-head"><h2>نمایش</h2></header>
        <div className="hx-row">
          <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(event) => set('active', event.target.checked)} />فعال و قابل خرید</label>
          <label className="sa-check"><input type="checkbox" checked={draft.featured} onChange={(event) => set('featured', event.target.checked)} />پیشنهاد ویژه</label>
          <NumberField label="ترتیب" value={draft.sort} onChange={(value) => set('sort', Number(value))} />
        </div>
      </section>

      <div className="hx-save">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>ذخیره</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDraft(null)}>انصراف</button>
      </div>
    </div>}

    {!draft && <section className="sa-card" aria-label="فهرست محصولات">
      {data && !data.products.length && <div className="hx-empty"><h2>هنوز محصولی نساخته‌اید</h2><p className="sa-hint">اولین هاست یا سرور را بسازید و قیمت هر دوره را تعیین کنید.</p></div>}
      {data && data.products.length > 0 && <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>محصول</th><th>نوع</th><th>تحویل</th><th>از</th><th>وضعیت</th><th><span className="sr-only">عملیات</span></th></tr></thead>
        <tbody>{data.products.map((row) => {
          const cheapest = row.prices.filter((line) => line.cycle !== 'HOURLY').sort((a, b) => Number(a.amountMinor) - Number(b.amountMinor))[0] || row.prices[0]
          const provider = data.providers.find((item) => item.id === row.providerId)
          return <tr key={row.id}>
            <td><b>{row.name}</b>{row.featured && <span className="sa-state is-info">ویژه</span>}<div className="hx-spec">{specLine(row)}</div></td>
            <td>{kindMeta(row.kind)?.label || row.kind}</td>
            <td>{row.fulfillment === 'DRIVER' ? provider?.name || 'سامانهٔ حذف‌شده' : 'دستی'}</td>
            <td>{cheapest ? <>{toman(cheapest.amountMinor)} <span className="hx-spec">/ {HOSTING_CYCLES.find((cycle) => cycle.id === cheapest.cycle)?.short}</span></> : '—'}</td>
            <td><span className={`sa-state ${row.active ? 'is-ok' : ''}`}>{row.active ? 'فعال' : 'غیرفعال'}</span></td>
            <td><div className="hx-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(row)}>ویرایش</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(row)}>حذف</button>
            </div></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>}
  </HostingShell>
}
