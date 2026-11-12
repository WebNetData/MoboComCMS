'use client'

import type { ScheduleDay } from '@/modules/shipping/domain/shipping'
import { PROVINCES } from '@/modules/shipping/domain/shipping'
import { useJson, faDate } from '../shared'

export type DeskShipment = { enabled: boolean; locationId: string; recipient: string; mobile: string; province: string; city: string; address: string; postalCode: string; date: string; slotId: string }
export const EMPTY_SHIPMENT: DeskShipment = { enabled: false, locationId: '', recipient: '', mobile: '', province: '', city: '', address: '', postalCode: '', date: '', slotId: '' }
export const shipmentInput = (value: DeskShipment) => value.enabled ? { locationId: Number(value.locationId), address: { title: 'آدرس من', recipient: value.recipient, mobile: value.mobile, province: value.province, city: value.city, address: value.address, postalCode: value.postalCode, plaque: '', unit: '', isDefault: false, lat: null, lng: null }, date: value.date, slotId: value.slotId, carrierId: '' } : undefined

export default function FulfilmentDesk({ value, onChange, discountCode, onDiscount }: { value: DeskShipment; onChange: (value: DeskShipment) => void; discountCode: string; onDiscount: (value: string) => void }) {
  const options = useJson<{ locations: { id: number; name: string }[]; days: ScheduleDay[] }>(value.enabled ? '/api/admin/store/counter?deskOptions=1' : null)
  const patch = (part: Partial<DeskShipment>) => onChange({ ...value, ...part })
  const day = options.data?.days.find(row => row.date === value.date)
  return <div className="cd-payment">
    <label className="cd-field"><span>کد تخفیف مشترک</span><input className="input cd-num" dir="ltr" value={discountCode} onChange={event => onDiscount(event.target.value.toUpperCase())} maxLength={32} autoComplete="off" /><small className="sa-hint">فقط کدهای مجاز برای مغازه یا هر دو کانال؛ مشتری باید با موبایل مشخص باشد.</small></label>
    <label className="cd-field"><span>نحوهٔ تحویل</span><select className="input" value={value.enabled ? 'SHIP' : 'HANDOVER'} onChange={event => patch({ enabled: event.target.value === 'SHIP' })}><option value="HANDOVER">تحویل همین‌جا از موجودی صندوق</option><option value="SHIP">پرداخت در مغازه، ارسال از انبار به خانه</option></select></label>
    {value.enabled && <>
      <p className="sa-hint">فقط کالای فیزیکی؛ وجه اکنون دریافت و سفارش برای آماده‌سازی وارد صف سفارش‌ها می‌شود.</p>
      {options.error && <p className="cd-error" role="alert">{options.error} <button type="button" className="sa-link" onClick={() => void options.reload()}>تلاش دوباره</button></p>}
      <label className="cd-field"><span>انبار ارسال</span><select className="input" required value={value.locationId} onChange={event => patch({ locationId: event.target.value })}><option value="">{options.loading ? 'در حال دریافت…' : 'انبار را انتخاب کنید'}</option>{options.data?.locations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <div className="cd-pair">
        <label className="cd-field"><span>نام گیرنده</span><input className="input" required maxLength={80} value={value.recipient} onChange={event => patch({ recipient: event.target.value })} /></label>
        <label className="cd-field"><span>موبایل گیرنده</span><input className="input" required dir="ltr" inputMode="tel" maxLength={20} value={value.mobile} onChange={event => patch({ mobile: event.target.value })} /></label>
        <label className="cd-field"><span>استان</span><select className="input" required value={value.province} onChange={event => patch({ province: event.target.value })}><option value="">انتخاب استان</option>{PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}</select></label>
        <label className="cd-field"><span>شهر</span><input className="input" required minLength={2} maxLength={60} value={value.city} onChange={event => patch({ city: event.target.value })} /></label>
      </div>
      <label className="cd-field"><span>نشانی کامل، پلاک و واحد</span><textarea className="input" required minLength={10} maxLength={400} value={value.address} onChange={event => patch({ address: event.target.value })} /></label>
      <label className="cd-field"><span>کد پستی ده‌رقمی</span><input className="input cd-num" required dir="ltr" inputMode="numeric" maxLength={10} value={value.postalCode} onChange={event => patch({ postalCode: event.target.value })} /></label>
      {!!options.data?.days.length && <div className="cd-pair"><label className="cd-field"><span>روز ارسال (پیک زمان‌بندی‌شده)</span><select className="input" value={value.date} onChange={event => patch({ date: event.target.value, slotId: '' })}><option value="">انتخاب روز</option>{options.data.days.map(row => <option key={row.date} value={row.date}>{faDate(`${row.date}T12:00:00+03:30`)}</option>)}</select></label><label className="cd-field"><span>بازهٔ ارسال</span><select className="input" value={value.slotId} onChange={event => patch({ slotId: event.target.value })}><option value="">انتخاب بازه</option>{day?.slots.map(slot => <option key={slot.id} value={slot.id} disabled={!slot.available}>{slot.label}{!slot.available ? ' · تکمیل' : ''}</option>)}</select></label></div>}
    </>}
  </div>
}
