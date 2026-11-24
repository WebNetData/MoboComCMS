'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BaleCheckout } from '@/modules/billing/domain/pay-bale-collection'
import { api, money } from './client'
import { ErrorNotice, Field } from './shared'
import s from './Pay.module.css'
import visual from './BankCheckout.module.css'

function sameSite(value: string): string | null {
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && /^https?:$/.test(url.protocol) ? url.href : null } catch { return null }
}

export default function BankCheckout({ id }: { id: string }) {
  const [data, setData] = useState<BaleCheckout | null>(null)
  const [error, setError] = useState(''), [revision, setRevision] = useState(0), [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false), [now, setNow] = useState(0), [copied, setCopied] = useState('')
  const [offset, setOffset] = useState(0), [uploading, setUploading] = useState(false), [payerName, setPayerName] = useState(''), [trackingCode, setTrackingCode] = useState(''), [paidAmount, setPaidAmount] = useState<string | null>(null), [image, setImage] = useState<File | null>(null)
  const [back, setBack] = useState<string | null>(null), action = useRef<AbortController | null>(null), generation = useRef(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      const current = generation.current
      try {
        const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' })
        if (controller.signal.aborted || current !== generation.current) return
        setOffset(new Date(row.serverTime).getTime() - Date.now()); setData(row); setError('')
        if (['PENDING', 'UNDER_REVIEW'].includes(row.status) && document.visibilityState === 'visible') timer = setTimeout(load, 3000)
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'دریافت وضعیت انجام نشد') }
    }
    function visible() { if (document.visibilityState === 'visible') { clearTimeout(timer); refresh() } else clearTimeout(timer) }
    void load(); document.addEventListener('visibilitychange', visible)
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
  }, [id, revision, refresh])
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => { setBack(data?.returnUrl ? sameSite(data.returnUrl) : null) }, [data?.returnUrl])
  useEffect(() => () => action.current?.abort(), [])
  async function accept() {
    if (!accepted || busy) return
    const controller = new AbortController(); action.current = controller; generation.current++
    setBusy(true); setError('')
    try { const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }), cache: 'no-store', signal: controller.signal }); if (!controller.signal.aborted) { generation.current++; setOffset(new Date(row.serverTime).getTime() - Date.now()); setData(row); refresh() } }
    catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'ثبت پذیرش انجام نشد') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function renew() {
    if (busy) return
    const controller = new AbortController(); action.current = controller
    setBusy(true); setError('')
    try {
      const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'renew' }), cache: 'no-store', signal: controller.signal })
      if (!/^[A-Za-z0-9_-]{32}$/.test(row.id)) throw new Error('شناسهٔ پرداخت تازه معتبر نیست')
      if (!controller.signal.aborted) window.location.assign(`/pay/bank/${row.id}`)
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'ساخت پرداخت تازه انجام نشد') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(`${label} کپی شد`) } catch { setCopied(`کپی ${label} انجام نشد؛ مقدار را انتخاب کنید`) }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!image || uploading || !payerName.trim() || !/^\d+$/.test(paidAmount ?? data?.collectedRial ?? '')) return
    if (image.size > 6 * 1024 * 1024) { setError('حجم تصویر باید حداکثر ۶ مگابایت باشد'); return }
    const controller = new AbortController(); action.current = controller; generation.current++; setUploading(true); setError('')
    try { const body = new FormData(); body.set('image', image); body.set('payerName', payerName.trim()); body.set('trackingCode', trackingCode); body.set('paidAmountRial', paidAmount ?? data!.collectedRial)
      const row = await api<BaleCheckout>(`/api/payment/mobocom-pay/collections/${encodeURIComponent(id)}/receipt`, { method: 'POST', body, signal: controller.signal, cache: 'no-store' })
      if (!controller.signal.aborted) { generation.current++; setOffset(new Date(row.serverTime).getTime() - Date.now()); setData(row); refresh() }
    } catch (reason) { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'ثبت رسید انجام نشد'); refresh() } }
    finally { if (!controller.signal.aborted) setUploading(false) }
  }
  const remaining = data && now ? Math.max(0, Math.ceil((new Date(data.expiresAt).getTime() - (now + offset)) / 1000)) : null
  const locallyExpired = data?.status === 'PENDING' && remaining === 0 && !uploading
  const countdown = remaining === null ? '—' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
  return <main className={`${s.page} ${s.checkout}`} dir="rtl">
    <header className={s.workspaceHead}><span className={s.eyebrow}>MoboCom Pay</span><h1>پرداخت بانکی سفارش</h1><p className={s.muted}>مبلغ دقیق را بررسی کنید و پس از پذیرش، راهنمای واریز را ببینید.</p></header>
    <ErrorNotice error={error} />
    {error && <><button className={s.secondary} type="button" onClick={refresh}>تلاش دوباره</button><p className={s.muted}>اگر دسترسی پرداخت پایان یافته، با دکمهٔ بازگشت مرورگر به صفحهٔ پرداخت برگردید.</p></>}
    {!data ? !error && <p role="status">در حال دریافت اطلاعات پرداخت…</p> : <>
      <section className={s.card} aria-labelledby="bank-payment-title">
        <h2 id="bank-payment-title">فاکتور <bdi>{data.invoiceNumber}</bdi></h2>
        <dl className={s.priceSummary}><div><dt>مبلغ فاکتور</dt><dd>{money(data.principalRial)}</dd></div><div><dt>هزینهٔ خدمت و تشخیص واریز</dt><dd>{money(data.adjustmentRial)}</dd></div><div><dt>مبلغ دقیق قابل واریز</dt><dd>{money(data.collectedRial)}</dd></div></dl>
        {data.status === 'PENDING' && !locallyExpired && <div className={visual.timer}><span>زمان باقی‌مانده برای واریز</span><strong><bdi dir="ltr">{countdown}</bdi></strong></div>}
      </section>
      {error ? null : data.status === 'UNDER_REVIEW' ? <section className={`${s.card} ${visual.entry}`} role="status"><h2>در حال بررسی و تأیید</h2><p>رسید شما ثبت شده است. نتیجه در همین صفحه نمایش داده می‌شود.</p></section>
        : data.status === 'EXPIRED' || locallyExpired ? <section className={`${s.card} ${s.stack} ${visual.expired}`}><h2>مهلت پرداخت فاکتور به اتمام رسید</h2><strong>دیگر واریز نکنید</strong><p>برای مبلغ تازه فاکتور جدید صادر کنید. اطلاعات واریز قبلی را استفاده نکنید؛ پذیرش دوباره لازم است.</p><button type="button" className={s.button} disabled={busy} onClick={renew}>{busy ? 'در حال دریافت…' : 'صدور مجدد فاکتور'}</button></section>
        : data.status === 'REVIEW' ? data.reviewReason === 'RECEIPT_REJECTED' ? <section className={`${s.card} ${s.stack}`}><h2>رسید تأیید نشد</h2><p>برای ارسال رسید تازه، ابتدا درخواست پرداخت جدید صادر کنید. از اطلاعات واریز قبلی استفاده نکنید.</p><button type="button" className={s.button} disabled={busy} onClick={renew}>{busy ? 'در حال دریافت…' : 'صدور درخواست تازه'}</button></section> : <p className={s.notice}>این پرداخت نیازمند بررسی است. لطفاً با پشتیبانی تماس بگیرید.</p>
        : data.status === 'PAID' ? <section className={s.card}><h2>پرداخت تأیید شد</h2><p>{data.receipt ? 'رسید بررسی و پرداخت ثبت شده است.' : 'واریز شما ثبت شده است.'}</p>{back && <a className={s.button} href={back}>بازگشت به سفارش</a>}</section>
        : !data.accepted ? <section className={`${s.card} ${s.stack}`}><h2>پذیرش هزینه و مبلغ دقیق</h2><p>هزینهٔ خدمت و تشخیص واریز جداگانه به مبلغ فاکتور افزوده شده است. مبلغ دقیق بالا را واریز کنید.</p><label><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /> مبلغ و هزینهٔ نمایش‌داده‌شده را می‌پذیرم</label><button type="button" className={s.button} disabled={!accepted || busy} onClick={accept}>{busy ? 'در حال ثبت…' : 'پذیرش و ادامه'}</button></section>
        : data.bank ? <><section className={`${s.card} ${s.stack} ${visual.destination} ${visual.entry}`} aria-labelledby="transfer-destination-title"><div><span className={s.eyebrow}>کارت به کارت</span><h2 id="transfer-destination-title">اطلاعات واریز</h2><p className={s.muted}>مبلغ دقیق را انتقال دهید؛ نتیجهٔ تأیید در همین صفحه نمایش داده می‌شود.</p></div>
          <div className={visual.amount}><span>مبلغ دقیق قابل واریز</span><strong>{money(data.collectedRial)}</strong><button type="button" className={s.secondary} onClick={() => void copy('مبلغ', data.collectedRial)}>کپی مبلغ ریالی</button></div>
          {data.bank.cardNumber && <div className={visual.cardNumber}><span>شماره کارت مقصد</span><bdi dir="ltr">{data.bank.cardNumber.replace(/(.{4})(?=.)/g, '$1 ')}</bdi><button type="button" className={s.secondary} onClick={() => void copy('شماره کارت', data.bank!.cardNumber)}>کپی شماره کارت</button></div>}
          <dl className={visual.details}>{([['بانک', data.bank.bankName], ['صاحب حساب', data.bank.holderName], ['شماره حساب', data.bank.accountNumber], ['شبا', data.bank.iban]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl><p className={visual.copyFeedback} role="status" aria-live="polite">{copied}</p></section>
        <form className={`${s.card} ${s.stack} ${visual.receipt}`} onSubmit={upload}><h2>ارسال رسید پرداخت</h2><p>اگر پرداخت کرده‌اید، تصویر رسید و مبلغ واریزی را ثبت کنید. مبلغ کامل یا اصل فاکتور پذیرفته می‌شود و رسید بررسی خواهد شد.</p><Field label="نام واریزکننده"><input required value={payerName} onChange={e => setPayerName(e.target.value)} /></Field><Field label="شماره پیگیری (اختیاری)"><input dir="ltr" value={trackingCode} onChange={e => setTrackingCode(e.target.value)} /></Field><Field label="مبلغ واریزی (ریال)"><input dir="ltr" inputMode="numeric" pattern="[0-9]+" required value={paidAmount ?? data.collectedRial} onChange={e => setPaidAmount(e.target.value)} /></Field><Field label="تصویر رسید، حداکثر ۶ مگابایت"><input type="file" accept="image/*" required onChange={e => setImage(e.target.files?.[0] || null)} /></Field><button className={s.button} type="submit" disabled={uploading}>{uploading ? 'در حال ارسال رسید…' : 'ثبت رسید'}</button></form></>
        : <p className={s.notice}>اطلاعات واریز هنوز آماده نیست. وضعیت را دوباره دریافت کنید.</p>}
    </>}
  </main>
}
