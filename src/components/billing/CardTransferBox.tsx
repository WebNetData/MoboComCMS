'use client'

import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/site/Icon'

export type TransferAccount = { id: number; bankName: string; holderName: string; card: string; sheba: string; accountNumber: string; note: string }
export type TransferReceipt = { id: number; status: string; trackingCode: string; payerBank: string; payerName?: string; createdAt: string; adminNote: string }

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const STEPS = ['واریز مبلغ', 'ارسال رسید', 'تأیید مدیریت']

/** Copies the value without its spaces; the button says so for a moment. */
function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" className={`ct-copy${done ? ' is-done' : ''}`} aria-label={`کپی ${label}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value.replace(/\s/g, '')); setDone(true); setTimeout(() => setDone(false), 1600) } catch { /* clipboard blocked */ }
  }}><Icon name={done ? 'check' : 'layers'} size={15} /><span aria-live="polite">{done ? 'کپی شد' : <>کپی<i> {label}</i></>}</span></button>
}

/** Bank details, the exact amount, and the receipt form for a card-to-card invoice. */
export default function CardTransferBox({ invoiceNumber, accounts, rial, toman, receipts, banks }: {
  invoiceNumber: string; accounts: TransferAccount[]; rial: string; toman: string; receipts: TransferReceipt[]; banks: string[]
}) {
  const router = useRouter()
  const pending = receipts.find((receipt) => receipt.status === 'PENDING')
  const rejected = !pending && receipts[0]?.status === 'REJECTED' ? receipts[0] : null
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [over, setOver] = useState(false)
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const account = accounts.find((item) => item.id === accountId) || accounts[0]
  const step = pending ? 2 : file && name.trim().length >= 3 ? 1 : 0

  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function choose(picked: File | null | undefined) {
    if (!picked) return
    if (!IMAGE_TYPES.includes(picked.type)) { setError('تصویر رسید باید PNG، JPG یا WebP باشد'); return }
    if (picked.size > MAX_IMAGE_BYTES) { setError('حجم تصویر رسید بیش از ۶ مگابایت است'); return }
    setError(''); setFile(picked)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) { setError('تصویر رسید را بارگذاری کنید'); return }
    setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    form.set('image', file)
    form.set('bankAccountId', String(account?.id || ''))
    const local = String(form.get('paidAtLocal') || '')
    if (local) form.set('paidAt', new Date(local).toISOString())
    form.delete('paidAtLocal')
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceNumber)}/receipt`, { method: 'POST', body: form }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'ارسال رسید انجام نشد'); return }
    setFile(null)
    router.refresh()
  }

  return (
    <div className="ct-box">
      <ol className="ct-steps" aria-label="مراحل پرداخت">
        {STEPS.map((label, index) => (
          <li key={label} className={index < step ? 'is-done' : index === step ? 'is-now' : ''} aria-current={index === step ? 'step' : undefined}>
            <i>{index < step ? <Icon name="check" size={14} /> : (index + 1).toLocaleString('fa-IR')}</i><span>{label}</span>
          </li>
        ))}
      </ol>

      <section className="ct-pay" aria-label="اطلاعات واریز">
        <div className="ct-amount">
          <span>مبلغ قابل واریز</span>
          <strong><b>{toman}</b> <small>تومان</small></strong>
          <div className="ct-amount-rial"><span>معادل <b>{rial}</b> ریال</span><Copy value={rial.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))} label="مبلغ به ریال" /></div>
          <p>دقیقاً همین مبلغ را به حساب زیر واریز کنید و سپس رسید آن را بفرستید.</p>
        </div>

        <div className="ct-wallet">
          {accounts.length > 1 && <div className="ct-tabs" role="radiogroup" aria-label="حساب مقصد">
            {accounts.map((item) => <button key={item.id} type="button" role="radio" aria-checked={item.id === account?.id} className={item.id === account?.id ? 'is-active' : ''} onClick={() => setAccountId(item.id)}>بانک {item.bankName}</button>)}
          </div>}
          {account && <>
            <div className="ct-card">
              <header><span><Icon name="bank" size={20} /> بانک {account.bankName}</span><i className="ct-chip" aria-hidden="true" /></header>
              {account.card && <div className="ct-card-main">
                <small>شماره کارت</small>
                <div><bdi className="ct-card-number" dir="ltr">{account.card}</bdi><Copy value={account.card} label="شماره کارت" /></div>
              </div>}
              {(account.sheba || account.accountNumber) && <dl className="ct-card-rows">
                {account.sheba && <div><dt>شماره شبا</dt><dd><bdi dir="ltr">{account.sheba}</bdi><Copy value={account.sheba} label="شماره شبا" /></dd></div>}
                {account.accountNumber && <div><dt>شماره حساب</dt><dd><bdi dir="ltr">{account.accountNumber}</bdi><Copy value={account.accountNumber} label="شماره حساب" /></dd></div>}
              </dl>}
              <footer><span><small>صاحب حساب</small>{account.holderName}</span></footer>
            </div>
            {account.note && <p className="ct-note">{account.note}</p>}
          </>}
        </div>
      </section>

      {pending ? (
        <div className="ct-state is-pending" role="status">
          <i><Icon name="clock" size={22} /></i>
          <div>
            <b>رسید شما دریافت شد و در انتظار تأیید مدیریت است</b>
            <p>معمولاً ظرف چند ساعت کاری بررسی می‌شود. با تأیید، فاکتور «پرداخت‌شده» می‌شود و سفارش شما ثبت می‌گردد.</p>
            <small>ارسال در {new Date(pending.createdAt).toLocaleString('fa-IR')}{pending.payerName ? ` · به نام ${pending.payerName}` : ''}</small>
          </div>
          <a className="ct-thumb" href={`/api/receipts/${pending.id}/image`} target="_blank" rel="noopener noreferrer" aria-label="دیدن تصویر رسید"><img src={`/api/receipts/${pending.id}/image`} alt="رسید ارسال‌شده" /></a>
        </div>
      ) : (
        <form className="ct-form" onSubmit={submit}>
          {rejected && <div className="ct-state is-rejected" role="alert">
            <i><Icon name="flag" size={20} /></i>
            <div><b>رسید قبلی تأیید نشد</b>{rejected.adminNote && <p>دلیل: {rejected.adminNote}</p>}<small>می‌توانید رسید درست را دوباره بفرستید.</small></div>
          </div>}
          <h4>ارسال رسید واریز</h4>
          <label className="ct-field">
            <span>نام و نام خانوادگی صاحب کارت مبدأ</span>
            <input className="input" name="payerName" required minLength={3} maxLength={80} autoComplete="name" placeholder="همان نامی که روی کارت واریزکننده است" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div
            className={`ct-drop${over ? ' is-over' : ''}${file ? ' has-file' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => { event.preventDefault(); setOver(false); choose(event.dataTransfer.files?.[0]) }}
          >
            <input ref={input} id="ct-image" className="ct-drop-input" type="file" accept={IMAGE_TYPES.join(',')} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = '' }} />
            {file && preview ? (
              <div className="ct-picked">
                <img src={preview} alt="پیش‌نمایش رسید" />
                <div><b>{file.name}</b><small className="num">{(file.size / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} کیلوبایت</small>
                  <span><label htmlFor="ct-image" className="ct-link">تغییر تصویر</label><button type="button" className="ct-link" onClick={() => setFile(null)}>حذف</button></span>
                </div>
              </div>
            ) : (
              <label htmlFor="ct-image" className="ct-drop-empty">
                <i><Icon name="upload" size={24} /></i>
                <b>تصویر رسید را اینجا رها کنید یا انتخاب کنید</b>
                <small>PNG، JPG یا WebP تا ۶ مگابایت</small>
              </label>
            )}
          </div>

          <details className="ct-more">
            <summary>جزئیات بیشتر <small>(اختیاری؛ بررسی را سریع‌تر می‌کند)</small></summary>
            <div className="ct-grid">
              <label className="ct-field"><span>شمارهٔ پیگیری / ارجاع</span><input className="input" name="trackingCode" dir="ltr" inputMode="numeric" maxLength={40} /></label>
              <label className="ct-field"><span>۴ رقم آخر کارت مبدأ</span><input className="input" name="payerCard" inputMode="numeric" dir="ltr" pattern="[0-9۰-۹]{4}|[0-9۰-۹]{16}" maxLength={16} placeholder="1234" /></label>
              <label className="ct-field"><span>بانک مبدأ</span><input className="input" name="payerBank" list="ct-banks" maxLength={60} placeholder="مثلاً ملت" /><datalist id="ct-banks">{banks.map((bank) => <option key={bank} value={bank} />)}</datalist></label>
              <label className="ct-field"><span>تاریخ و ساعت واریز</span><input className="input" type="datetime-local" name="paidAtLocal" dir="ltr" /></label>
            </div>
          </details>

          {error && <p className="ct-error" role="alert">{error}</p>}
          <button className="btn btn-primary ct-submit" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال رسید برای تأیید'}</button>
          <p className="ct-hint"><Icon name="lock" size={14} /> تصویر رسید فقط برای شما و کارشناس مالی قابل دیدن است.</p>
        </form>
      )}
    </div>
  )
}
