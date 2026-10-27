'use client'

import JalaliDateInput from '@/components/date/JalaliDateInput'
import { freeAreaLabel, type Carrier, type FreeArea, type FreeShippingRule } from '@/modules/shipping/domain/carriers'

const AREAS: [FreeArea, string][] = [['city', 'شهر فروشگاه'], ['outside', 'خارج از شهر فروشگاه'], ['province', 'استان فروشگاه'], ['cities', 'شهرهای انتخابی'], ['except', 'همه‌جا به‌جز شهرهای انتخابی'], ['country', 'سراسر کشور']]
const toman = (rial: number) => Math.round(rial / 10)
const digits = (value: string) => Math.max(0, Math.round(Number(value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0))
// The day as the device sees it: an ISO moment at local midnight in Tehran is the previous day in UTC.
const dateOnly = (iso: string) => { const at = new Date(iso); return iso && Number.isFinite(at.getTime()) ? `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` : '' }

/**
 * Free shipping by order size and place: "orders over 5,000,000 Toman ship free inside our city". Each rule has a
 * minimum (Toman here, stored as Rial like every shipping amount), an area, optional carriers and an optional window.
 */
export default function FreeRules({ rules, carriers, origin, onChange }: { rules: FreeShippingRule[]; carriers: Carrier[]; origin: { province: string; city: string }; onChange: (rules: FreeShippingRule[]) => void }) {
  const set = (id: string, patch: Partial<FreeShippingRule>) => onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
  function add() {
    let n = rules.length + 1, id = `rule-${n}`
    while (rules.some((rule) => rule.id === id)) id = `rule-${++n}`
    onChange([...rules, { id, enabled: true, label: '', minRial: 50_000_000, area: 'city', cities: [], carrierIds: [], startsAt: '', endsAt: '' }])
  }
  return <section className="sa-card sa-form cr-free" aria-labelledby="cr-free-title">
    <header className="sa-card-head"><h2 id="cr-free-title">قواعد ارسال رایگان</h2></header>
    <p className="sa-hint">وقتی جمع کالاهای سبد به حداقل برسد و آدرس مشتری در محدودهٔ قاعده باشد، هزینهٔ ارسال صفر می‌شود؛ در سبد خرید هم نوار «چقدر تا ارسال رایگان» نشان داده می‌شود. شهر فروشگاه: <b>{origin.city}</b> ({origin.province}).</p>
    {!rules.length && <p className="sa-empty">هنوز قاعده‌ای ندارید؛ مثلاً «خرید بالای ۵ میلیون تومان، ارسال رایگان در شهر فروشگاه».</p>}
    <ol className="cr-free-list">{rules.map((rule) => <li key={rule.id} className={rule.enabled ? '' : 'is-off'}>
      <div className="cr-line">
        <label className="sa-check"><input type="checkbox" checked={rule.enabled} onChange={(e) => set(rule.id, { enabled: e.target.checked })} /><b>{rule.label || `ارسال رایگان ${freeAreaLabel(rule, origin)} از ${toman(rule.minRial).toLocaleString('fa-IR')} تومان`}</b></label>
        <button type="button" className="sa-link is-danger" onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}>حذف قاعده</button>
      </div>
      <div className="sa-grid">
        <label className="sa-field"><span>حداقل جمع کالاها (تومان)</span><input className="input num" dir="ltr" inputMode="numeric" value={toman(rule.minRial)} onChange={(e) => set(rule.id, { minRial: digits(e.target.value) * 10 })} /></label>
        <label className="sa-field"><span>محدوده</span><select className="select" value={rule.area} onChange={(e) => set(rule.id, { area: e.target.value as FreeArea })}>{AREAS.map(([value, label]) => <option key={value} value={value}>{value === 'city' || value === 'outside' ? `${label} (${origin.city})` : value === 'province' ? `${label} (${origin.province})` : label}</option>)}</select></label>
        {(rule.area === 'cities' || rule.area === 'except') && <label className="sa-field"><span>شهرها (با ویرگول)</span><input className="input" value={rule.cities.join('، ')} onChange={(e) => set(rule.id, { cities: e.target.value.split(/[,،]/).map((city) => city.trim()).filter(Boolean) })} placeholder="قائم‌شهر، ساری، بابل" /></label>}
        <label className="sa-field"><span>متن برای مشتری (اختیاری)</span><input className="input" maxLength={80} value={rule.label} onChange={(e) => set(rule.id, { label: e.target.value })} placeholder={`ارسال رایگان ${freeAreaLabel(rule, origin)}`} /></label>
        <div className="sa-field"><span>از تاریخ (اختیاری)</span><JalaliDateInput aria-label="از تاریخ" value={dateOnly(rule.startsAt)} onChange={(day) => set(rule.id, { startsAt: day ? new Date(`${day}T00:00:00`).toISOString() : '' })} /></div>
        <div className="sa-field"><span>تا تاریخ (اختیاری)</span><JalaliDateInput aria-label="تا تاریخ" value={dateOnly(rule.endsAt)} onChange={(day) => set(rule.id, { endsAt: day ? new Date(`${day}T23:59:59`).toISOString() : '' })} /></div>
      </div>
      <fieldset className="cr-free-carriers"><legend>روش‌های ارسال (هیچ‌کدام = همه)</legend>{carriers.map((carrier) => <label key={carrier.id} className="sa-check"><input type="checkbox" checked={rule.carrierIds.includes(carrier.id)} onChange={(e) => set(rule.id, { carrierIds: e.target.checked ? [...rule.carrierIds, carrier.id] : rule.carrierIds.filter((id) => id !== carrier.id) })} />{carrier.name}{carrier.enabled ? '' : ' (غیرفعال)'}</label>)}</fieldset>
    </li>)}</ol>
    <button type="button" className="btn btn-ghost" onClick={add}>+ قاعدهٔ ارسال رایگان</button>
  </section>
}
