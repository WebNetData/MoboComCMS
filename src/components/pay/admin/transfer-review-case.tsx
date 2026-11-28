'use client'
import { useEffect, useRef, useState } from 'react'
import type { TransferReviewDetail } from '@/modules/billing/domain/pay-transfer-operations'
import { api, json, money, date } from '../client'
import { Field, ErrorNotice } from '../shared'
import s from '../Pay.module.css'
import o from './TransferOperations.module.css'

const differences = { EXACT: 'مبلغ دقیق درخواست', UNDER: 'کمتر از مبلغ درخواست', OVER: 'بیشتر از مبلغ درخواست', UNASSIGNED: 'فاکتور هنوز مشخص نشده' }
const actions: Record<string,string> = { 'mobocom-pay.transfer-review.assign': 'ارتباط مدرک با فاکتور', 'mobocom-pay.transfer-review.dismiss': 'بستن بررسی بدون ثبت مالی', 'mobocom-pay.transfer-review.confirm': 'تأیید واریز با بررسی مدیر', 'mobocom-pay.transfer.paid': 'ثبت قطعی پرداخت', 'mobocom-pay.transfer.receipt-review': 'تصمیم دربارهٔ رسید', 'mobocom-pay.transfer.review': 'ارجاع به بررسی', 'mobocom-pay.transfer.receipt': 'دریافت رسید' }
type SearchResult = { items: { id: string; invoiceNumber: string; totalRial: string; status: string }[] }
export default function TransferReviewCase({ selected, onDecided }: { selected: { kind: 'id' | 'collection'; id: string }; onDecided: () => void }) {
  const [data, setData] = useState<TransferReviewDetail | null>(null), [reload, setReload] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  const [note, setNote] = useState(''), [number, setNumber] = useState(''), [results, setResults] = useState<SearchResult | null>(null), [chosen, setChosen] = useState(''), [ack, setAck] = useState(false)
  const [trackingCode, setTrackingCode] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api<TransferReviewDetail>(`/api/admin/mobocom-pay/transfer-reviews?${selected.kind}=${encodeURIComponent(selected.id)}`, { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setData(d) }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'دریافت پرونده انجام نشد') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selected.id, selected.kind, reload])
  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setResults(null); setChosen('')
    try { setResults(await api<SearchResult>(`/api/admin/mobocom-pay/transfer-reviews?id=${encodeURIComponent(selected.id)}&invoice=${encodeURIComponent(number.trim())}`)) } catch (e) { setError(e instanceof Error ? e.message : 'جست‌وجو انجام نشد') } finally { setBusy(false) }
  }
  async function decide(action: 'assign' | 'dismiss' | 'confirm' | 'receipt-approve' | 'receipt-reject') {
    if (!data) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const receipt = action.startsWith('receipt-')
      await api(`/api/admin/mobocom-pay/${receipt ? 'receipts' : 'transfer-reviews'}`, json('PATCH', receipt ? {
        id: data.collection?.receipt?.id, action: action === 'receipt-approve' ? 'approve' : 'reject', note,
        ...(action === 'receipt-approve' && data.requiresTrackingCode && { trackingCode: trackingCode.trim() }),
      } : { noticeId: data.notice?.id, version: data.version, action, note, ...(action === 'assign' ? { collectionId: chosen } : {}) }))
      setFeedback(action === 'confirm' || action === 'receipt-approve' ? 'نتیجه ثبت شد؛ وضعیت مالی از سرور بازخوانی می‌شود.' : 'نتیجهٔ بررسی ثبت شد.'); setAck(false); setNote(''); setTrackingCode(''); setChosen(''); setResults(null); setReload(v => v + 1); onDecided()
    } catch (e) { setError(e instanceof Error ? e.message : 'تصمیم ثبت نشد') } finally { setBusy(false) }
  }
  const open = data?.status === 'OPEN', receipt = data?.collection?.receipt, validNote = note.trim().length >= 3
  const manageNotice = selected.kind === 'id' && data?.notice && open
  return <section className={`${s.card} ${o.case}`} aria-labelledby="transfer-case-title" aria-busy={loading || busy}>
    <div className={s.row}><h2 id="transfer-case-title" ref={heading} tabIndex={-1}>جزئیات و سابقهٔ بررسی</h2><button className={s.secondary} type="button" disabled={loading || busy} onClick={() => setReload(v => v + 1)}>بازخوانی پرونده</button></div>
    <ErrorNotice error={error} />{feedback && <p className={s.notice} role="status">{feedback}</p>}{loading && <p role="status">در حال دریافت پرونده…</p>}
    {data && !loading && <>
      <div className={o.columns}>
        <section className={s.stack}>
          <h3>مدرک بانکی</h3>
          {data.notice ? <>
            {data.notice.candidate && <p className={s.notice}>پیامک هم‌مبلغ پیدا شده و هنوز به فاکتور متصل نشده است.</p>}
            <dl className={o.facts}>
              <div><dt>مبلغ دریافتی</dt><dd>{money(data.notice.amountRial)}</dd></div>
              <div><dt>منبع</dt><dd>{data.notice.source === 'SMS' ? 'پیامک' : 'بله'}</dd></div>
              <div><dt>{data.notice.timeBasis === 'SERVER_RECEIPT' ? 'زمان دریافت سرور' : 'زمان دریافت در منبع'}</dt><dd>{date(data.notice.sourceSentAt)}</dd></div>
              <div><dt>زمان ثبت سرور</dt><dd>{date(data.notice.receivedAt)}</dd></div>
              {!data.notice.candidate && <div><dt>نتیجهٔ پرونده</dt><dd>{data.status === 'CONFIRMED' ? 'تأییدشده' : data.status === 'DISMISSED' ? 'بسته‌شده بدون ثبت مالی' : 'در حال بررسی'}</dd></div>}
            </dl>
          </> : <p className={s.muted}>پیام بانکی مرتبط با این پرونده در دسترس نیست.</p>}
        </section>
        <section className={s.stack}><h3>درخواست پرداخت</h3>{data.collection ? <dl className={o.facts}><div><dt>فاکتور</dt><dd><bdi>{data.collection.invoiceNumber}</bdi></dd></div><div><dt>مبلغ دقیق درخواست</dt><dd>{money(data.collection.totalRial)}</dd></div><div><dt>اصل فاکتور</dt><dd>{money(data.collection.principalRial)}</dd></div><div><dt>وضعیت مالی</dt><dd>{data.collection.invoiceStatus === 'PAID' ? 'پرداخت‌شده؛ ثبت دوباره مجاز نیست' : data.collection.invoiceStatus === 'UNPAID' ? 'تسویه نشده' : 'فاکتور بسته شده'}</dd></div><div><dt>پایان مهلت اولیه</dt><dd>{date(data.collection.expiresAt)}</dd></div>{data.notice && <div><dt>تطبیق مبلغ</dt><dd>{differences[data.difference]}{data.deltaRial && data.deltaRial !== '0' && ` · اختلاف: ${money(data.deltaRial)}`}</dd></div>}</dl> : <p className={s.muted}>شمارهٔ فاکتور را با مدرک پرداخت‌کننده تطبیق دهید و پایین وارد کنید.</p>}</section>
      </div>
      {manageNotice && <form className={s.stack} onSubmit={search}><h3>یافتن فاکتور مشخص</h3><Field label="شمارهٔ دقیق فاکتور"><input value={number} onChange={e => setNumber(e.target.value)} maxLength={160} required /></Field><div><button className={s.secondary} type="submit" disabled={busy || !number.trim()}>جست‌وجوی فاکتور</button></div>{results && (!results.items.length ? <p role="status">درخواست هم‌حسابی برای این شماره پیدا نشد.</p> : <Field label="انتخاب درخواست پرداخت"><select value={chosen} onChange={e => setChosen(e.target.value)}><option value="">انتخاب کنید</option>{results.items.map(r => <option key={r.id} value={r.id}>{r.invoiceNumber} · {money(r.totalRial)} · {r.status === 'PAID' ? 'پرداخت‌شده' : 'درخواست ثبت‌شده'}</option>)}</select></Field>)}</form>}
      {receipt && <section className={s.stack}><h3>رسید ارسالی پرداخت‌کننده</h3><a href={receipt.imageUrl} target="_blank" rel="noreferrer"><img className={s.receiptImage} src={receipt.imageUrl} alt="تصویر رسید ارسالی برای بررسی واریز" /></a><p>مبلغ اعلام‌شده: {money(receipt.amountRial)} · {receipt.status === 'PENDING' ? 'در انتظار بررسی' : receipt.status === 'APPROVED' ? 'تأییدشده' : 'ردشده'}</p>{receipt.note && <p>{receipt.note}</p>}</section>}
      {(manageNotice || data.canReviewReceipt && receipt?.status === 'PENDING') && <section className={o.confirm}>
        <Field label="دلیل و نتیجهٔ بررسی (۳ تا ۳۰۰ نویسه)"><textarea value={note} onChange={e => setNote(e.target.value)} minLength={3} maxLength={300} rows={3} required /></Field>
        {data.requiresTrackingCode && <Field label="شناسهٔ پیگیری بانک برای تأیید رسید"><input type="text" dir="auto" maxLength={64} value={trackingCode} onChange={e => setTrackingCode(e.target.value)} /></Field>}
        <p className={s.muted}>بستن بررسی، وجهی ثبت یا مسترد نمی‌کند. رسید نابرابر باید برای اصلاح پیگیری شود؛ مبلغ فاکتور و کیف پول تغییر نمی‌کند.</p>
        {(data.canConfirm || data.canReviewReceipt && receipt?.status === 'PENDING') && <label className={s.check}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />مدرک وصول وجه و مقصد را بررسی کردم و نتیجهٔ مالی را تأیید می‌کنم.</label>}
        <div className={s.actions}>
          {manageNotice && <><button className={s.secondary} type="button" disabled={busy || !validNote || !chosen} onClick={() => void decide('assign')}>ثبت ارتباط با فاکتور</button><button className={s.secondary} type="button" disabled={busy || !validNote} onClick={() => void decide('dismiss')}>بستن بررسی بدون ثبت مالی</button>{data.canConfirm && <button className={s.button} type="button" disabled={busy || !validNote || !ack} onClick={() => void decide('confirm')}>تأیید واریز دقیق و ثبت پرداخت</button>}</>}
          {data.canReviewReceipt && receipt?.status === 'PENDING' && <button className={s.button} type="button" disabled={busy || !validNote || !ack || data.requiresTrackingCode && !trackingCode.trim()} onClick={() => void decide('receipt-approve')}>{data.collection?.invoiceStatus === 'PAID' ? 'ثبت رسید برای پرداخت قبلاً تأییدشده' : 'تأیید وصول وجه از رسید'}</button>}
          {data.canRejectReceipt && <button className={s.secondary} type="button" disabled={busy || !validNote} onClick={() => void decide('receipt-reject')}>رد رسید با دلیل</button>}
        </div>
      </section>}
      <section className={s.stack}><h3>سابقهٔ ثبت‌شده · ۵۰ رویداد اخیر</h3>{!data.history.length && <p className={s.muted}>هنوز تصمیمی ثبت نشده است.</p>}<ol className={o.history}>{data.history.map(h => <li key={h.id}><strong>{actions[h.action] || 'رویداد درخواست پرداخت'}</strong><p className={s.muted}>{date(h.createdAt)} · شناسهٔ بررسی‌کننده {h.actorId.toLocaleString('fa-IR')}</p>{h.note && <p>{h.note}</p>}</li>)}</ol></section>
    </>}
  </section>
}
