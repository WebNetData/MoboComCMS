'use client'

import Link from '@/components/AppLink'
import { useEffect, useMemo, useState } from 'react'
import { Notice } from '../store/shared'
import FreeRules from './FreeRules'
import CarrierEditor, { carrierSummary } from './CarrierEditor'
import { PROVINCES } from '@/modules/shipping/domain/shipping'
import { CARRIER_PRESETS, ZONE_LABEL, etaLabel, presetCarrier, quotes, type Carrier, type CarrierSettings } from '@/modules/shipping/domain/carriers'

const rial = (value: number) => value.toLocaleString('fa-IR')
const num = (value: string) => Math.max(0, Math.round(Number(value.replace(/[^\d]/g, '')) || 0))

/** Carriers (Post, Tipax, Chapar, Alopeyk, own courier), rate tables by zone and weight, and a live price check. */
export default function ShippingCarriersPage() {
  const [settings, setSettings] = useState<CarrierSettings | null>(null)
  const [saved, setSaved] = useState('')
  const [open, setOpen] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [preset, setPreset] = useState('blank')
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
  const origin = { province: settings.originProvince, city: settings.originCity }

  function addCarrier() {
    if (!settings) return
    const carrier = presetCarrier(preset, settings.carriers.map((item) => item.id))
    setSettings({ ...settings, carriers: [...settings.carriers, carrier] })
    setOpen(carrier.id)
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
                <small className="sa-sub">{carrierSummary(carrier, origin)}</small>
                <button type="button" className="sa-link" aria-expanded={open === carrier.id} onClick={() => setOpen(open === carrier.id ? '' : carrier.id)}>{open === carrier.id ? 'بستن' : 'تعرفه و تنظیمات'}</button>
              </div>
              {open === carrier.id && <CarrierEditor carrier={carrier} origin={origin} onChange={(patch) => setCarrier(carrier.id, patch)} onRemove={() => setSettings({ ...settings, carriers: settings.carriers.filter((item) => item.id !== carrier.id) })} />}
            </li>)}
          </ol>
          <div className="cr-add">
            <label className="sa-field"><span>افزودن روش ارسال از الگو</span><select className="select" value={preset} onChange={(e) => setPreset(e.target.value)}>{CARRIER_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            <button type="button" className="btn btn-ghost" onClick={addCarrier}>+ افزودن</button>
          </div>
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
          {item.ok ? <><span>{ZONE_LABEL[item.zone]} · {etaLabel(item.etaMin, item.etaMax)}</span><strong>{item.collect ? (item.feeRial ? `پس‌کرایه + ${rial(item.feeRial)} ریال` : 'پس‌کرایه') : item.free ? 'رایگان' : `${rial(item.feeRial)} ریال`}</strong>{item.freeBy && <small className="sa-sub">{item.freeBy}</small>}</> : <span>{item.reason}</span>}
        </li>)}{!preview.length && <li className="is-off">هیچ روش ارسالی فعال نیست.</li>}</ul>
      </section>
    </div>
  </div>
}
