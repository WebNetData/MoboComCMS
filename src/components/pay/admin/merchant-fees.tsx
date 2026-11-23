"use client";
import { useState } from "react";
import type { PayMerchantView, PayFeeBearer } from "@/modules/billing/domain/pay";
import { Field } from "../shared";
import s from "../Pay.module.css";

export default function MerchantFees({ merchant, busy, action }: { merchant: PayMerchantView; busy: boolean; action: (url: string, body: unknown) => Promise<void> }) {
  const [bearer, setBearer] = useState<PayFeeBearer>(merchant.fees.feeBearer), [percent, setPercent] = useState(String(merchant.fees.feeBps / 100)), [flat, setFlat] = useState(merchant.fees.flatFeeRial), [cap, setCap] = useState(merchant.fees.feeCapRial);
  return <details className={s.feeDetails}><summary>قرارداد کارمزد {merchant.name}</summary>
    <form className={s.stack} onSubmit={e => { e.preventDefault(); void action("/api/admin/mobocom-pay/merchants", { action: "terms", id: merchant.id, feeBearer: bearer, feeBps: Math.round(Number(percent) * 100), flatFeeRial: flat, feeCapRial: cap }); }}>
      <p className={s.muted}>کارمزد هر پرداخت برابر مبلغ ثابت + درصد است و از سقف تعیین‌شده بیشتر نمی‌شود. تغییر فقط روی پرداخت‌های تازه اثر دارد.</p>
      <div className={s.railFields}>
        <Field label="کارمزد بر عهده"><select value={bearer} onChange={e => setBearer(e.target.value as PayFeeBearer)}><option value="MERCHANT">پذیرنده؛ کسر از دریافتی</option><option value="CUSTOMER">مشتری؛ افزوده به مبلغ سفارش</option></select></Field>
        <Field label="درصد کارمزد"><input type="number" dir="ltr" min="0" max="30" step="0.01" value={percent} onChange={e => setPercent(e.target.value)} required /></Field>
        <Field label="کارمزد ثابت به ریال"><input dir="ltr" inputMode="numeric" value={flat} onChange={e => setFlat(e.target.value)} required /></Field>
        <Field label="سقف مجموع کارمزد به ریال؛ صفر بدون سقف"><input dir="ltr" inputMode="numeric" value={cap} onChange={e => setCap(e.target.value)} required /></Field>
      </div><div><button type="submit" className={s.button} disabled={busy}>ذخیره قرارداد کارمزد</button></div>
    </form>
  </details>;
}
