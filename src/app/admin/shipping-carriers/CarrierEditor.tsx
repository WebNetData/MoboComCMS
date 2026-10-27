'use client'

import { KIND_LABEL, PRICING_LABEL, ZONE_LABEL, type Carrier, type PlaceFee, type PlaceMode, type Pricing, type Zone } from '@/modules/shipping/domain/carriers'

const ZONES: Zone[] = ['city', 'province', 'country']
const num = (value: string) => Math.max(0, Math.round(Number(value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0))
const list = (value: string) => value.split(/[،,]/).map((item) => item.trim()).filter(Boolean)
const BUILT_IN = ['post-pishtaz', 'post-sefareshi', 'tipax', 'chapar', 'alopeyk', 'courier']

/** An amount in Rial (as every shipping amount is stored) with its Toman reading under it. */
function RialField({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: number) => void; hint?: string }) {
  return <label className="sa-field"><span>{label}</span>
    <input className="input num" dir="ltr" inputMode="numeric" value={value} onChange={(e) => onChange(num(e.target.value))} />
    <small className="sa-sub">{value > 0 ? `${Math.round(value / 10).toLocaleString('fa-IR')} تومان` : hint || 'صفر'}</small>
  </label>
}

/** Everything about one carrier: what it is, where it goes, how it is priced and when it is offered. */
export default function CarrierEditor({ carrier, origin, onChange, onRemove }: { carrier: Carrier; origin: { province: string; city: string }; onChange: (patch: Partial<Carrier>) => void; onRemove: () => void }) {
  const setRate = (zone: Zone, key: keyof Carrier['rates']['city'], value: number) => onChange({ rates: { ...carrier.rates, [zone]: { ...carrier.rates[zone], [key]: value } } })
  const setFee = (index: number, patch: Partial<PlaceFee>) => onChange({ placeFees: carrier.placeFees.map((fee, i) => (i === index ? { ...fee, ...patch } : fee)) })
  const served = ZONES.filter((zone) => carrier.zones[zone])
  const zoneName: Record<Zone, string> = { city: `داخل ${origin.city}`, province: `شهرهای دیگر استان ${origin.province}`, country: 'استان‌های دیگر' }
  return <div className="cr-edit sa-form">
    <div className="sa-grid">
      <label className="sa-field"><span>نام نمایشی</span><input className="input" value={carrier.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })} /></label>
      <label className="sa-field"><span>نوع</span><select className="select" value={carrier.kind} onChange={(e) => onChange({ kind: e.target.value as Carrier['kind'] })}>{Object.entries(KIND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>

    <fieldset className="cr-group">
      <legend>کجا ارسال می‌کند</legend>
      <div className="cr-zones">{ZONES.map((zone) => <label key={zone} className="sa-check"><input type="checkbox" checked={carrier.zones[zone]} onChange={(e) => onChange({ zones: { ...carrier.zones, [zone]: e.target.checked } })} />{zoneName[zone]}</label>)}</div>
      <div className="sa-grid">
        <label className="sa-field"><span>محدودهٔ مقصد</span><select className="select" value={carrier.placeMode} onChange={(e) => onChange({ placeMode: e.target.value as PlaceMode })}>
          <option value="all">همهٔ مقصدهای مسیرهای بالا</option>
          <option value="only">فقط استان‌ها و شهرهای زیر</option>
          <option value="except">همه به‌جز استان‌ها و شهرهای زیر</option>
        </select></label>
        {carrier.placeMode !== 'all' && <>
          <label className="sa-field"><span>استان‌ها (با ویرگول)</span><input className="input" value={carrier.provinces.join('، ')} onChange={(e) => onChange({ provinces: list(e.target.value) })} placeholder="مازندران، گلستان" /></label>
          <label className="sa-field"><span>شهرها (با ویرگول)</span><input className="input" value={carrier.cities.join('، ')} onChange={(e) => onChange({ cities: list(e.target.value) })} placeholder="ساری، بابل" /></label>
        </>}
      </div>
      {!served.length && <p className="sa-hint is-warn">هیچ مسیری انتخاب نشده؛ این روش به مشتری نشان داده نمی‌شود.</p>}
    </fieldset>

    <fieldset className="cr-group">
      <legend>هزینهٔ ارسال</legend>
      <div className="sa-grid">
        <label className="sa-field"><span>نحوهٔ محاسبه</span><select className="select" value={carrier.pricing} onChange={(e) => onChange({ pricing: e.target.value as Pricing })}>{Object.entries(PRICING_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {carrier.pricing === 'flat' && <RialField label="مبلغ ثابت (ریال)" value={carrier.flatRial} onChange={(flatRial) => onChange({ flatRial })} />}
        <RialField label={carrier.pricing === 'collect' ? 'مبلغی که همین حالا گرفته می‌شود (ریال)' : 'هزینهٔ ثابت اضافه (ریال)'} value={carrier.extraRial} onChange={(extraRial) => onChange({ extraRial })} hint="مثلاً بسته‌بندی، بیمه یا تحویل به باربری" />
      </div>
      {carrier.pricing === 'collect' && <p className="sa-hint">کرایهٔ حمل را گیرنده هنگام تحویل می‌پردازد؛ مشتری در تکمیل سفارش «پس‌کرایه» می‌بیند. قواعد ارسال رایگان روی این روش اعمال نمی‌شوند.</p>}
      {served.length > 0 && <table className="data cr-rates">
        <thead><tr><th>مسیر</th>{carrier.pricing === 'zone' && <><th>پایه (کیلوی اول، ریال)</th><th>هر کیلوی بعد (ریال)</th></>}<th>زمان تحویل (روز کاری)</th></tr></thead>
        <tbody>{served.map((zone) => <tr key={zone}>
          <th scope="row">{ZONE_LABEL[zone]}</th>
          {carrier.pricing === 'zone' && <>
            <td><input className="input num" dir="ltr" aria-label={`پایه ${ZONE_LABEL[zone]}`} value={carrier.rates[zone].baseRial} onChange={(e) => setRate(zone, 'baseRial', num(e.target.value))} /></td>
            <td><input className="input num" dir="ltr" aria-label={`هر کیلو ${ZONE_LABEL[zone]}`} value={carrier.rates[zone].perKgRial} onChange={(e) => setRate(zone, 'perKgRial', num(e.target.value))} /></td>
          </>}
          <td className="cr-eta"><input className="input num" dir="ltr" aria-label={`از چند روز ${ZONE_LABEL[zone]}`} value={carrier.rates[zone].etaMin} onChange={(e) => setRate(zone, 'etaMin', num(e.target.value))} /><span>تا</span><input className="input num" dir="ltr" aria-label={`تا چند روز ${ZONE_LABEL[zone]}`} value={carrier.rates[zone].etaMax} onChange={(e) => setRate(zone, 'etaMax', num(e.target.value))} /></td>
        </tr>)}</tbody>
      </table>}
      {carrier.pricing !== 'collect' && <div className="cr-place-fees">
        <b>مبلغ دستی برای شهر یا استان خاص</b>
        <small className="sa-sub">به‌جای مبلغ محاسبه‌شده همان مقصد؛ شهر بر استانش مقدم است.</small>
        {carrier.placeFees.map((fee, index) => <div key={index} className="cr-place-fee">
          <select className="select" aria-label="شهر یا استان" value={fee.level} onChange={(e) => setFee(index, { level: e.target.value === 'province' ? 'province' : 'city' })}><option value="city">شهر</option><option value="province">استان</option></select>
          <input className="input" aria-label="نام" value={fee.place} maxLength={40} onChange={(e) => setFee(index, { place: e.target.value })} placeholder={fee.level === 'city' ? 'ساری' : 'گلستان'} />
          <input className="input num" dir="ltr" aria-label="مبلغ (ریال)" value={fee.feeRial} onChange={(e) => setFee(index, { feeRial: num(e.target.value) })} />
          <small className="sa-sub">{Math.round(fee.feeRial / 10).toLocaleString('fa-IR')} تومان</small>
          <button type="button" className="sa-link is-danger" onClick={() => onChange({ placeFees: carrier.placeFees.filter((_, i) => i !== index) })}>حذف</button>
        </div>)}
        <button type="button" className="sa-link" onClick={() => onChange({ placeFees: [...carrier.placeFees, { level: 'city', place: '', feeRial: 0 }] })}>+ مبلغ برای یک مقصد</button>
      </div>}
    </fieldset>

    <fieldset className="cr-group">
      <legend>شرط‌ها</legend>
      <div className="sa-grid">
        <RialField label="فقط برای سفارش‌های از (ریال)" value={carrier.minOrderRial} onChange={(minOrderRial) => onChange({ minOrderRial })} hint="بدون حداقل" />
        <RialField label="فقط برای سفارش‌های تا (ریال)" value={carrier.maxOrderRial} onChange={(maxOrderRial) => onChange({ maxOrderRial })} hint="بدون سقف" />
        {carrier.pricing !== 'collect' && <RialField label="ارسال رایگان از (ریال)" value={carrier.freeOverRial} onChange={(freeOverRial) => onChange({ freeOverRial })} hint="هرگز" />}
        <label className="sa-field"><span>حداکثر وزن (گرم)</span><input className="input num" dir="ltr" value={carrier.maxWeightGrams} onChange={(e) => onChange({ maxWeightGrams: num(e.target.value) })} /></label>
      </div>
    </fieldset>

    <label className="sa-field"><span>نشانی رهگیری شرکت (با {'{code}'} به‌جای کد)</span><input className="input" dir="ltr" value={carrier.trackingUrl} onChange={(e) => onChange({ trackingUrl: e.target.value })} placeholder="https://tracking.post.ir/?id={code}" /></label>
    <label className="sa-field"><span>توضیح برای مشتری</span><input className="input" value={carrier.note} maxLength={120} onChange={(e) => onChange({ note: e.target.value })} /></label>
    <label className="sa-check"><input type="checkbox" checked={carrier.scheduled} onChange={(e) => onChange({ scheduled: e.target.checked })} />مشتری روز و ساعت تحویل را انتخاب کند (برنامهٔ صفحهٔ زمان‌بندی ارسال)</label>
    {!BUILT_IN.includes(carrier.id) && <button type="button" className="sa-link is-danger" onClick={onRemove}>حذف این روش</button>}
  </div>
}

/** One line under the carrier's name: what it is, where it goes and what it costs. */
export function carrierSummary(carrier: Carrier, origin: { city: string }) {
  const where = carrier.zones.city && carrier.zones.province && carrier.zones.country ? 'سراسر کشور' : carrier.zones.city && !carrier.zones.province && !carrier.zones.country ? `فقط ${origin.city}` : !carrier.zones.city && carrier.zones.province && carrier.zones.country ? `خارج از ${origin.city}` : ZONES.filter((zone) => carrier.zones[zone]).map((zone) => ZONE_LABEL[zone]).join('، ') || 'بدون مسیر'
  const limit = carrier.placeMode === 'only' ? ' (محدود)' : carrier.placeMode === 'except' ? ' (با استثنا)' : ''
  const toman = (rial: number) => `${Math.round(rial / 10).toLocaleString('fa-IR')} تومان`
  const price = carrier.pricing === 'collect' ? `پس‌کرایه${carrier.extraRial ? ` + ${toman(carrier.extraRial)}` : ''}` : carrier.pricing === 'flat' ? `ثابت ${toman(carrier.flatRial + carrier.extraRial)}` : `از ${toman((carrier.zones.city ? carrier.rates.city.baseRial : carrier.zones.province ? carrier.rates.province.baseRial : carrier.rates.country.baseRial) + carrier.extraRial)}`
  return `${KIND_LABEL[carrier.kind]} · ${where}${limit} · ${price}`
}
