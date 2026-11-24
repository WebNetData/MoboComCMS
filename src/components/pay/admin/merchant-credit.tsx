'use client'
import { useState } from 'react'
import type { MerchantDetail } from '@/modules/billing/domain/pay-merchant-admin'
import type { MerchantAdminAction } from './merchant-detail'
import { Field } from '../shared'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

export default function MerchantCredit({ merchant, disabled, action }: { merchant: MerchantDetail['merchant']; disabled: boolean; action: MerchantAdminAction }) {
  const [creditCurrency, setCurrency] = useState<'IRR' | 'USDT'>(merchant.creditCurrency || 'IRR')
  return <form className={o.panel} onSubmit={e => { e.preventDefault(); void action({ action: 'credit-mode', creditCurrency }) }}>
    <Field label="ارز اعتبار پرداخت"><select value={creditCurrency} onChange={e => setCurrency(e.target.value as 'IRR' | 'USDT')}><option value="IRR">ریال</option><option value="USDT">USDT داخلی</option></select></Field>
    <p className={s.muted}>این تغییر فقط برای پرداخت‌های تازه است و موجودی‌های پیشین حفظ می‌شوند. اعتبار USDT داخلی به پذیرنده تعلق دارد.</p>
    <button className={s.secondary} type="submit" disabled={disabled}>ذخیره ارز اعتبار</button>
  </form>
}
