'use client'

import { useId, useState, type RefObject } from 'react'
import { Field, ErrorNotice } from '../shared'
import { api } from '../client'
import s from '../Pay.module.css'
import v from '../BankCheckout.module.css'

export default function ReceiptForm<T = unknown>({ dialogRef, endpoint, onSubmitted, onSending }: {
  dialogRef: RefObject<HTMLDialogElement | null>
  endpoint: string
  onSubmitted: (result: T) => void
  onSending?: (value: boolean) => void
}) {
  const title = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <dialog ref={dialogRef} className={v.dialog} aria-labelledby={title} dir="rtl" onCancel={event => { if (busy) event.preventDefault() }}>
    <div className={v.dialogHead}>
      <h2 id={title}>ارسال رسید پرداخت</h2>
      <button type="button" className={s.secondary} disabled={busy} onClick={() => dialogRef.current?.close()}>بستن</button>
    </div>
    <p className={v.muted}>اگر مبلغ دقیق را واریز کرده‌اید، تصویر رسید را برای بررسی بفرستید.</p>
    <form className={`${s.stack} ${v.receipt}`} onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      const form = event.currentTarget
      const body = new FormData(form)
      const file = body.get('image')
      if (!(file instanceof File) || file.size < 1 || file.size > 6 * 1024 * 1024) {
        setError('تصویر رسید باید حداکثر ۶ مگابایت باشد')
        return
      }
      setBusy(true)
      onSending?.(true)
      setError('')
      try {
        const result = await api<T>(endpoint, { method: 'POST', body })
        form.reset()
        dialogRef.current?.close()
        onSubmitted(result)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'ارسال رسید ناموفق بود')
      } finally {
        setBusy(false)
        onSending?.(false)
      }
    }}>
      <ErrorNotice error={error} />
      <Field label="نام و نام خانوادگی صاحب کارت مبدأ"><input name="payerName" minLength={3} maxLength={80} autoComplete="name" required /></Field>
      <Field label="تصویر رسید، حداکثر ۶ مگابایت"><input name="image" type="file" accept="image/png,image/jpeg,image/webp" required /></Field>
      <button className={s.button} type="submit" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال رسید برای بررسی'}</button>
    </form>
  </dialog>
}
