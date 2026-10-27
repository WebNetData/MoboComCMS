'use client'

import Link from '@/components/AppLink'
import { useEffect, useMemo, useState } from 'react'
import { Notice } from '../store/shared'
import FreeRules from './FreeRules'
import { PROVINCES } from '@/modules/shipping/domain/shipping'
import { ZONE_LABEL, etaLabel, quotes, type Carrier, type CarrierSettings, type Zone } from '@/modules/shipping/domain/carriers'

const ZONES: Zone[] = ['city', 'province', 'country']
const KIND_LABEL: Record<Carrier['kind'], string> = { post: 'پست', express: 'پیک سراسری (اکسپرس)', local: 'پیک درون‌شهری' }
const rial = (value: number) => value.toLocaleString('fa-IR')
const num = (value: string) => Math.max(0, Math.round(Number(value.replace(/[^\d]/g, '')) || 0))

/** Carriers (Post, Tipax, Chapar, Alopeyk, own courier), rate tables by zone and weight, and a live price check. */
export default function ShippingCarriersPage() {
  const [settings, setSettings] = useState<CarrierSettings | null>(null)
  const [saved, setSaved] = useState('')
  const [open, setOpen] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sim, setSim] = useState({ province: 'اصفهان', city: 'اصفهان', grams: '1500', itemRial: '20000000' })

  useEffect(() => {
    fetch('/api/admin/shipping/carriers', { cache: 'no-store' }).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
      if (!ok) { setNotice({ tone: 'error', text: data?.error || 'بارگذاری انجام نشد' }); return }
      setSettings(data.settings); setSaved(JSON.stringify(data.settings))
    }).catch(() => setNotice({ tone: 'error', text: 'ارتباط برقرار نشد' }))
  }, [])

  const preview = useMemo(() => settings ? quotes(settings, { dest: { province: sim.province, city: sim.city }, weightGrams: num(sim.grams), itemRial: num(sim.itemRial) }) : [], [settings, sim])

  if (!settings) return <div className="sa" dir="rtl">{notice ? <Notice tone="error">{notice.text}</Notice> : <div className="sa-skeleton" />}</div>
  const dirty = JSON.stringify(settings) !== saved
  const setCarrier = (id: string, patch: Partial<Carrier>) => setSettings({ ...settings, carriers: settings.carriers.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const setRate = (carrier: Carrier, zone: Zone, key: keyof Carrier['rates']['city'], value: number) => setCarrier(carrier.id, { rates: { ...carrier.rates, [zone]: { ...carrier.rates[zone], [key]: value } } })

  function addCarrier() {
    if (!settings) return
    let id = 'custom', n = 2
    while (settings.carriers.some((item) => item.id === id)) id = `custom-${n++}`
    const blank = { baseRial: 0, perKgRial: 0, etaMin: 1, etaMax: 3 }
    setSettings({ ...settings, carriers: [...settings.carriers, { id, name: 'روش ارسال جدید', enabled: false, kind: 'express', rates: { city: { ...blank }, province: { ...blank }, country: { ...blank } }, cities: [], maxWeightGrams: 30_000, freeOverRial: 0, scheduled: false, trackingUrl: '', note: '' }] })
    setOpen(id)
  }

  async function save() {
    if (!settings) return
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/shipping/carriers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: data?.error || 'ذخیره انجام نشد' }); return }
    setSettings(data.settings); setSaved(JSON.stringify(data.settings)); setNotice({ tone: 'ok', text: 'ذخیره شد؛ از همین حالا در تکمیل سفارش اعمال می‌شود.' })
  }

  return <div className="sa" dir="rtl">
    <header className="sa-head">
      <div><h1>شرکت‌های حمل و تعرفهٔ ارسال</h1><p className="sa-hint">هزینهٔ ارسال بر اساس شهر و استان مقصد، وزن مرسوله و روش ارسالی که مشتری انتخاب می‌کند محاسبه می‌شود.</p></div>
      <div className="sa-head-actions"><Link href="/admin/store/shipments" className="btn btn-ghost">مرسوله‌ها</Link><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>تنظیمات کلی</h2></header>
          <label className="sa-check"><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />محاسبهٔ هزینهٔ ارسال با شرکت‌های حمل (به‌جای هزینهٔ ثابت صفحهٔ «زمان‌بندی و هزینهٔ ارسال»)</label>
          <div className="sa-grid">
            <label className="sa-field"><span>استان مبدأ (انبار)</span><select className="select" value={settings.originProvince} onChange={(e) => setSettings({ ...settings, originProvince: e.target.value })}>{PROVINCES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="sa-field"><span>شهر مبدأ</span><input className="input" value={settings.originCity} maxLength={40} onChange={(e) => setSettings({ ...settings, originCity: e.target.value })} /></label>
            <label className="sa-field"><span>وزن بسته‌بندی (گرم)</span><input className="input num" inputMode="numeric" dir="ltr" value={settings.packagingGrams} onChange={(e) => setSettings({ ...settings, packagingGrams: num(e.target.value) })} /></label>
            <label className="sa-field"><span>وزن پیش‌فرض کالای بدون وزن (گرم)</span><input className="input num" inputMode="numeric" dir="ltr" value={settings.defaultWeightGrams} onChange={(e) => setSettings({ ...settings, defaultWeightGrams: num(e.target.value) })} /></label>
          </div>
          <p className="sa-hint">وزن هر کالا از فیلد «وزن» در ویرایش محصول خوانده می‌شود. کیلوی اول در «پایه» است و هر کیلوی بعد (گرد به بالا) «هر کیلو» اضافه می‌شود.</p>
        </section>

        <section className="sa-card">
          <header className="sa-card-head"><h2>روش‌های ارسال</h2><small>{settings.carriers.filter((item) => item.enabled).length.toLocaleString('fa-IR')} فعال</small></header>
          <ol className="cr-list">
            {settings.carriers.map((carrier) => <li key={carrier.id} className={`cr-row${carrier.enabled ? '' : ' is-off'}${open === carrier.id ? ' is-open' : ''}`}>
              <div className="cr-line">
                <label className="sa-check"><input type="checkbox" checked={carrier.enabled} onChange={(e) => setCarrier(carrier.id, { enabled: e.target.checked })} /><b>{carrier.name}</b></label>
                <small className="sa-sub">{KIND_LABEL[carrier.kind]} · پایه {carrier.kind === 'local' ? ZONE_LABEL.city : ZONE_LABEL.country}: {rial(carrier.kind === 'local' ? carrier.rates.city.baseRial : carrier.rates.country.baseRial)} ریال</small>
                <button type="button" className="sa-link" aria-expanded={open === carrier.id} onClick={() => setOpen(open === carrier.id ? '' : carrier.id)}>{open === carrier.id ? 'بستن' : 'تعرفه و تنظیمات'}</button>
              </div>
              {open === carrier.id && <div className="cr-edit sa-form">
                <div className="sa-grid">
                  <label className="sa-field"><span>نام نمایشی</span><input className="input" value={carrier.name} maxLength={40} onChange={(e) => setCarrier(carrier.id, { name: e.target.value })} /></label>
                  <label className="sa-field"><span>نوع</span><select className="select" value={carrier.kind} onChange={(e) => setCarrier(carrier.id, { kind: e.target.value as Carrier['kind'] })}>{Object.entries(KIND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="sa-field"><span>حداکثر وزن (گرم)</span><input className="input num" dir="ltr" value={carrier.maxWeightGrams} onChange={(e) => setCarrier(carrier.id, { maxWeightGrams: num(e.target.value) })} /></label>
                  <label className="sa-field"><span>ارسال رایگان از (ریال، ۰ = هرگز)</span><input className="input num" dir="ltr" value={carrier.freeOverRial} onChange={(e) => setCarrier(carrier.id, { freeOverRial: num(e.target.value) })} /></label>
                </div>
                <table className="data cr-rates">
                  <thead><tr><th>مسیر</th><th>پایه (کیلوی اول، ریال)</th><th>هر کیلوی بعد (ریال)</th><th>زمان تحویل (روز کاری)</th></tr></thead>
                  <tbody>{ZONES.filter((zone) => carrier.kind !== 'local' || zone === 'city').map((zone) => <tr key={zone}>
                    <th scope="row">{ZONE_LABEL[zone]}</th>
                    <td><input className="input num" dir="ltr" aria-label={`پایه ${ZONE_LABEL[zone]}`} value={carrier.rates[zone].baseRial} onChange={(e) => setRate(carrier, zone, 'baseRial', num(e.target.value))} /></td>
                    <td><input className="input num" dir="ltr" aria-label={`هر کیلو ${ZONE_LABEL[zone]}`} value={carrier.rates[zone].perKgRial} onChange={(e) => setRate(carrier, zone, 'perKgRial', num(e.target.value))} /></td>
                    <td className="cr-eta"><input className="input num" dir="ltr" aria-label="از" value={carrier.rates[zone].etaMin} onChange={(e) => setRate(carrier, zone, 'etaMin', num(e.target.value))} /><span>تا</span><input className="input num" dir="ltr" aria-label="تا" value={carrier.rates[zone].etaMax} onChange={(e) => setRate(carrier, zone, 'etaMax', num(e.target.value))} /></td>
                  </tr>)}</tbody>
                </table>
                {carrier.kind === 'local' && <label className="sa-field"><span>شهرهای تحت پوشش (با ویرگول؛ خالی = فقط شهر انبار)</span><input className="input" value={carrier.cities.join('، ')} onChange={(e) => setCarrier(carrier.id, { cities: e.target.value.split(/[،,]/).map((city) => city.trim()).filter(Boolean) })} /></label>}
                <label className="sa-field"><span>نشانی رهگیری شرکت (با {'{code}'} به‌جای کد)</span><input className="input" dir="ltr" value={carrier.trackingUrl} onChange={(e) => setCarrier(carrier.id, { trackingUrl: e.target.value })} placeholder="https://tracking.post.ir/?id={code}" /></label>
                <label className="sa-field"><span>توضیح برای مشتری</span><input className="input" value={carrier.note} maxLength={120} onChange={(e) => setCarrier(carrier.id, { note: e.target.value })} /></label>
                <label className="sa-check"><input type="checkbox" checked={carrier.scheduled} onChange={(e) => setCarrier(carrier.id, { scheduled: e.target.checked })} />مشتری روز و ساعت تحویل را انتخاب کند (برنامهٔ صفحهٔ زمان‌بندی ارسال)</label>
                {!['post-pishtaz', 'post-sefareshi', 'tipax', 'chapar', 'alopeyk', 'courier'].includes(carrier.id) && <button type="button" className="sa-link is-danger" onClick={() => setSettings({ ...settings, carriers: settings.carriers.filter((item) => item.id !== carrier.id) })}>حذف این روش</button>}
              </div>}
            </li>)}
          </ol>
          <button type="button" className="btn btn-ghost" onClick={addCarrier}>+ روش ارسال دیگر</button>
        </section>
        <FreeRules rules={settings.freeRules || []} carriers={settings.carriers} origin={{ province: settings.originProvince, city: settings.originCity }} onChange={(freeRules) => setSettings({ ...settings, freeRules })} />
      </div>

      <section className="sa-card sa-form cr-sim">
        <header className="sa-card-head"><h2>محاسبهٔ آزمایشی</h2></header>
        <p className="sa-hint">مشتری در همین شرایط در صفحهٔ تکمیل سفارش این گزینه‌ها را می‌بیند (با تنظیمات ذخیره‌نشده).</p>
        <div className="sa-grid">
          <label className="sa-field"><span>استان مقصد</span><select className="select" value={sim.province} onChange={(e) => setSim({ ...sim, province: e.target.value, city: e.target.value === 'تهران' ? 'تهران' : sim.city })}>{PROVINCES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="sa-field"><span>شهر مقصد</span><input className="input" value={sim.city} onChange={(e) => setSim({ ...sim, city: e.target.value })} /></label>
          <label className="sa-field"><span>وزن کالاها + بسته (گرم)</span><input className="input num" dir="ltr" value={sim.grams} onChange={(e) => setSim({ ...sim, grams: e.target.value })} /></label>
          <label className="sa-field"><span>مبلغ کالاها (ریال)</span><input className="input num" dir="ltr" value={sim.itemRial} onChange={(e) => setSim({ ...sim, itemRial: e.target.value })} /></label>
        </div>
        <ul className="cr-quotes">{preview.map((item) => <li key={item.carrierId} className={item.ok ? '' : 'is-off'}>
          <b>{item.name}</b>
          {item.ok ? <><span>{ZONE_LABEL[item.zone]} · {etaLabel(item.etaMin, item.etaMax)}</span><strong>{item.free ? 'رایگان' : `${rial(item.feeRial)} ریال`}</strong>{item.freeBy && <small className="sa-sub">{item.freeBy}</small>}</> : <span>{item.reason}</span>}
        </li>)}{!preview.length && <li className="is-off">هیچ روش ارسالی فعال نیست.</li>}</ul>
      </section>
    </div>
  </div>
}
