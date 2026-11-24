'use client'
import { useState } from 'react'
import type { MerchantDetail } from '@/modules/billing/domain/pay-merchant-admin'
import type { MerchantAdminAction } from './merchant-detail'
import { Field } from '../shared'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

export default function MerchantProfile({ merchant: m, disabled, action }: { merchant: MerchantDetail['merchant']; disabled: boolean; action: MerchantAdminAction }) {
  const [name, setName] = useState(m.name), [website, setWebsite] = useState(m.website), [inherit, setInherit] = useState(Boolean(m.fees.inherited)), [bearer, setBearer] = useState(m.fees.feeBearer), [bps, setBps] = useState(String(m.fees.feeBps)), [flat, setFlat] = useState(m.fees.flatFeeRial), [cap, setCap] = useState(m.fees.feeCapRial)
  return <>
    <form className={o.panel} onSubmit={e => { e.preventDefault(); void action({ action: 'profile', name, website }) }}><h3>مشخصات کسب‌وکار</h3><div className={o.fields}><Field label="نام کسب‌وکار"><input required value={name} maxLength={100} onChange={e => setName(e.target.value)} /></Field><Field label="وب‌سایت کسب‌وکار"><input type="url" dir="ltr" required maxLength={1000} value={website} onChange={e => setWebsite(e.target.value)} /></Field></div><p className={s.muted}>مالک حساب ثابت است؛ دامنهٔ جدید نباید مقصد پایانه یا اتصال موجود را نامعتبر کند.</p><div><button className={s.secondary} type="submit" disabled={disabled}>ذخیره مشخصات پذیرنده</button></div></form>
    <form className={o.panel} onSubmit={e => { e.preventDefault(); void action({ action: 'terms', inherit, ...(!inherit ? { feeBearer: bearer, feeBps: Number(bps), flatFeeRial: flat, feeCapRial: cap } : {}) }) }}><h3>قرارداد کارمزد</h3><label className={s.check}><input type="checkbox" checked={inherit} onChange={e => setInherit(e.target.checked)} />استفاده از کارمزد پیش‌فرض پلتفرم</label>{!inherit && <div className={o.fields}><Field label="پرداخت‌کنندهٔ کارمزد"><select value={bearer} onChange={e => setBearer(e.target.value as typeof bearer)}><option value="MERCHANT">پذیرنده</option><option value="CUSTOMER">مشتری</option></select></Field><Field label="نرخ کارمزد (واحد صدم درصد)"><input dir="ltr" type="number" required min={0} max={3000} step={1} value={bps} onChange={e => setBps(e.target.value)} /></Field><Field label="مبلغ ثابت کارمزد (ریال)"><input dir="ltr" inputMode="numeric" required value={flat} onChange={e => setFlat(e.target.value)} /></Field><Field label="سقف کارمزد (ریال؛ صفر بدون سقف)"><input dir="ltr" inputMode="numeric" required value={cap} onChange={e => setCap(e.target.value)} /></Field></div>}<p className={s.muted}>هر ۱۰۰ واحد نرخ برابر ۱٪ است. تغییر قرارداد فقط برای پرداخت‌های تازه است؛ سوابق مالی تغییر نمی‌کنند.</p><div><button className={s.secondary} type="submit" disabled={disabled}>ذخیره قرارداد پذیرنده</button></div></form>
  </>
}
