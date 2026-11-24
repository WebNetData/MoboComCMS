'use client'

import type { FormEvent, RefObject } from 'react'
import { Field } from '../shared'
import s from '../Pay.module.css'
import v from '../BankCheckout.module.css'

export default function ReceiptDialog({ dialogRef, uploading, error, payerName, trackingCode, amount, onPayerName, onTrackingCode, onAmount, onImage, onSubmit }: {
  dialogRef: RefObject<HTMLDialogElement | null>; uploading: boolean; error: string
  payerName: string; trackingCode: string; amount: string
  onPayerName: (value: string) => void; onTrackingCode: (value: string) => void
  onAmount: (value: string) => void; onImage: (value: File | null) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return <dialog ref={dialogRef} className={v.dialog} aria-labelledby="transfer-receipt-title" dir="rtl">
    <div className={v.dialogHead}><h2 id="transfer-receipt-title">ارسال رسید پرداخت</h2><button type="button" className={s.secondary} onClick={() => dialogRef.current?.close()} aria-label="بستن فرم رسید">بستن</button></div>
    <p className={v.muted}>پس از ثبت رسید، درخواست در حال بررسی می‌ماند و مهلت پرداخت بسته نمی‌شود.</p>
    {error && <p className={v.error} role="alert">{error}</p>}
    <form className={`${s.stack} ${v.receipt}`} onSubmit={onSubmit}>
      <Field label="نام واریزکننده"><input autoComplete="name" required maxLength={100} value={payerName} onChange={event => onPayerName(event.target.value)} /></Field>
      <Field label="شماره پیگیری (اختیاری)"><input dir="ltr" maxLength={64} value={trackingCode} onChange={event => onTrackingCode(event.target.value)} /></Field>
      <Field label="مبلغ واریزی (ریال)"><input dir="ltr" inputMode="numeric" pattern="[0-9]+" required value={amount} onChange={event => onAmount(event.target.value)} /></Field>
      <Field label="تصویر رسید، حداکثر ۶ مگابایت"><input type="file" accept="image/png,image/jpeg,image/webp" required onChange={event => onImage(event.target.files?.[0] || null)} /></Field>
      <button className={s.button} type="submit" disabled={uploading}>{uploading ? 'در حال ارسال رسید…' : 'ثبت رسید'}</button>
    </form>
  </dialog>
}
