'use client'

import { useState } from 'react'
import type { PayFeeTerms } from '@/modules/billing/domain/pay'
import { api, json } from '../client'
import { Field } from '../shared'
import s from '../Pay.module.css'

export default function FeeShare({ terms, disabled, action }: {
  terms: PayFeeTerms
  disabled: boolean
  action: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const current = terms.customerFeeShareBps
  const [mode, setMode] = useState(current === undefined ? 'default' : current === 0 ? 'merchant' : current === 10000 ? 'customer' : 'shared')
  const [percent, setPercent] = useState(current && current < 10000 ? String(current / 100) : '50')
  const [saved, setSaved] = useState(false)
  const customerShare = mode === 'default' ? null : mode === 'merchant' ? 0 : mode === 'customer' ? 10000 : Math.round(Number(percent) * 100)
  const valid = mode !== 'shared' || Number(percent) > 0 && Number(percent) < 100 && customerShare !== 0 && customerShare !== 10000
  return <form className={`${s.card} ${s.stack}`} onSubmit={event => {
    event.preventDefault()
    if (disabled || !valid) return
    void action(async () => {
      await api('/api/pay/fee-share', json('PATCH', { customerFeeShareBps: customerShare }))
      setSaved(true)
    })
  }}>
    <h2>سهم کارمزد پرداخت</h2>
    <p className={s.muted}>برای لینک‌ها و سفارش‌های تازهٔ ربات، مشخص کنید کارمزد مصوب بین شما و مشتری چگونه تقسیم شود.</p>
    <div className={s.grid}>
      <Field label="پرداخت‌کنندهٔ کارمزد">
        <select value={mode} onChange={event => { setSaved(false); setMode(event.target.value) }}>
          <option value="default">طبق قرارداد ({terms.feeBearer === 'CUSTOMER' ? 'مشتری' : 'پذیرنده'})</option>
          <option value="merchant">تمام کارمزد از من کسر شود</option>
          <option value="customer">تمام کارمزد به مبلغ مشتری اضافه شود</option>
          <option value="shared">تقسیم بین من و مشتری</option>
        </select>
      </Field>
      {mode === 'shared' && <Field label="درصد مشتری از کارمزد"><input type="number" dir="ltr" min="0.01" max="99.99" step="0.01" required value={percent}
        onChange={event => { setSaved(false); setPercent(event.target.value) }} /></Field>}
    </div>
    {mode === 'shared' && valid && <p className={s.muted}>سهم شما {(100 - Number(percent)).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪ از کارمزد است.</p>}
    <div><button type="submit" className={s.secondary} disabled={disabled || !valid || (current ?? null) === customerShare}>ذخیره سهم کارمزد</button></div>
    {saved && <p className={s.muted} role="status">سهم کارمزد ذخیره شد.</p>}
  </form>
}
