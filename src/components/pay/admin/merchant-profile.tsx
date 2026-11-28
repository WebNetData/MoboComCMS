'use client'
import { useState, type FormEvent } from 'react'
import type { MerchantDetail } from '@/modules/billing/domain/pay-merchant-admin'
import type { MerchantAdminAction } from './merchant-detail'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'
import o from './Merchants.module.css'
import FeeFields from './fee-fields'
import { readFeeFields } from './fee-form-values'

export default function MerchantProfile({ merchant: m, disabled, action }: { merchant: MerchantDetail['merchant']; disabled: boolean; action: MerchantAdminAction }) {
  const [name, setName] = useState(m.name), [website, setWebsite] = useState(m.website), [inherit, setInherit] = useState(Boolean(m.fees.inherited)), [bearer, setBearer] = useState(m.fees.feeBearer)
  const [feeError, setFeeError] = useState('')
  function saveFees(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeeError('')
    try {
      if (inherit) { void action({ action: 'terms', inherit: true }); return }
      const fee = readFeeFields(new FormData(event.currentTarget), 'merchant-fee')
      void action({ action: 'terms', inherit: false, feeBearer: bearer, feeBps: fee.bps, flatFeeRial: fee.flat, feeCapRial: fee.cap })
    } catch (error) {
      setFeeError(error instanceof Error ? error.message : 'مقادیر کارمزد را بررسی کنید.')
    }
  }
  return <>
    <form className={o.panel} onSubmit={e => { e.preventDefault(); void action({ action: 'profile', name, website }) }}><h3>مشخصات کسب‌وکار</h3><div className={o.fields}><Field label="نام کسب‌وکار"><input required value={name} maxLength={100} onChange={e => setName(e.target.value)} /></Field><Field label="وب‌سایت کسب‌وکار (اختیاری)"><input type="url" dir="ltr" maxLength={1000} value={website} onChange={e => setWebsite(e.target.value)} /></Field></div><p className={s.muted}>مالک حساب ثابت است؛ دامنهٔ جدید نباید مقصد پایانه یا اتصال موجود را نامعتبر کند.</p><div><button className={s.secondary} type="submit" disabled={disabled}>ذخیره مشخصات پذیرنده</button></div></form>
    <form className={o.panel} onSubmit={saveFees} onChange={() => setFeeError('')}>
      <h3>قرارداد کارمزد</h3>
      <label className={s.check}><input type="checkbox" checked={inherit} onChange={e => setInherit(e.target.checked)} />استفاده از کارمزد پیش‌فرض پلتفرم</label>
      {!inherit && <>
        <Field label="پرداخت‌کنندهٔ کارمزد"><select value={bearer} onChange={e => setBearer(e.target.value as typeof bearer)}><option value="MERCHANT">پذیرنده</option><option value="CUSTOMER">مشتری</option></select></Field>
        <FeeFields name="merchant-fee" values={{ bps: m.fees.feeBps, flat: m.fees.flatFeeRial, cap: m.fees.feeCapRial }} />
      </>}
      <p className={s.muted}>تغییر قرارداد برای پرداخت‌های تازه اعمال می‌شود.</p>
      <ErrorNotice error={feeError} />
      <div><button className={s.secondary} type="submit" disabled={disabled}>ذخیره قرارداد پذیرنده</button></div>
    </form>
  </>
}
