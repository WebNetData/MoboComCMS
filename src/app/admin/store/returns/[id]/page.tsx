'use client'

import Link from '@/components/AppLink'
import { useParams } from '@/platform/routing/navigation'
import { useState } from 'react'
import { Money, Notice, RETURN_TONE, StoreShell, fa, faDate, send, useJson } from '../../shared'

type Line = { line: number; quantity: number; name: string; variantName: string; image: string }
type Request = {
  id: number; number: string; kind: 'CANCEL' | 'RETURN'; kindLabel: string; status: string; statusLabel: string; reasonLabel: string; description: string
  photos: string[]; lines: Line[]; requested: number; refund: number; currency: string; adminNote: string; createdAt: string; decidedAt: string | null; refundedAt: string | null; restocked: boolean
}
type View = Request & {
  order: { id: number; status: string; fulfilment: string; deliveredAt: string | null; total: number; refunded: number; remaining: number; invoiceNumber: string; customer: { id: number; name: string; email: string; phone: string } }
  history: Request[]
}

export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>()
  const { data, error, setData } = useJson<View>(`/api/admin/store/returns/${params.id}`)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [restock, setRestock] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [photo, setPhoto] = useState('')

  async function act(action: 'approve' | 'reject' | 'refund') {
    if (!data) return
    if (action === 'refund' && !window.confirm(`${(Number(amount) || data.requested).toLocaleString('fa-IR')} به کیف پول مشتری واریز شود؟ این کار برگشت‌پذیر نیست.`)) return
    setBusy(true); setNotice(null)
    const result = await send<View>(`/api/admin/store/returns/${data.id}`, 'POST', { action, note, ...(action === 'refund' ? { amount: amount || undefined, restock } : {}) })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setData(result.data); setNote(''); setAmount('')
    setNotice({ tone: 'ok', text: action === 'refund' ? 'مبلغ به کیف پول مشتری واریز شد.' : action === 'approve' ? 'درخواست تأیید شد و به مشتری اطلاع داده شد.' : 'درخواست رد شد و دلیل برای مشتری ارسال شد.' })
  }

  if (!data) return <StoreShell title="درخواست لغو / مرجوعی">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" />}</StoreShell>
  const open = data.status === 'REQUESTED' || data.status === 'APPROVED'
  return <StoreShell title={`${data.kindLabel} ${data.number}`} actions={<Link href="/admin/store/returns" className="btn btn-ghost">بازگشت به فهرست</Link>}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>درخواست مشتری</h2><span className={`sa-state ${RETURN_TONE[data.status] || ''}`}>{data.statusLabel}</span></header>
          <dl className="rt-facts">
            <div><dt>نوع</dt><dd>{data.kindLabel}</dd></div>
            <div><dt>دلیل</dt><dd>{data.reasonLabel}</dd></div>
            <div><dt>ثبت</dt><dd>{faDate(data.createdAt, true)}</dd></div>
            <div><dt>مبلغ درخواستی</dt><dd><Money value={data.requested} currency={data.currency} /></dd></div>
          </dl>
          {data.description && <blockquote className="rt-quote">{data.description}</blockquote>}
          <ul className="rt-lines">{data.lines.map((line) => <li key={line.line}>
            {line.image ? <img src={line.image} alt="" /> : <span className="sa-ph" />}
            <div><b>{line.name}</b>{line.variantName && <small className="sa-sub">{line.variantName}</small>}</div>
            <span className="num">× {fa(line.quantity)}</span>
          </li>)}</ul>
          {data.photos.length > 0 && <>
            <h3 className="rt-h3">عکس‌های ارسالی مشتری</h3>
            <div className="rt-photos">{data.photos.map((src, index) => <button type="button" key={src} onClick={() => setPhoto(src)} aria-label={`نمایش عکس ${fa(index + 1)}`}><img src={src} alt={`عکس ${fa(index + 1)}`} /></button>)}</div>
          </>}
        </section>

        {data.history.length > 0 && <section className="sa-card">
          <header className="sa-card-head"><h2>درخواست‌های قبلی این سفارش</h2></header>
          <ul className="rt-history">{data.history.map((item) => <li key={item.id}><Link href={`/admin/store/returns/${item.id}`} className="sa-link num" dir="ltr">{item.number}</Link><span>{item.kindLabel}</span><span className={`sa-state ${RETURN_TONE[item.status] || ''}`}>{item.statusLabel}</span>{item.status === 'REFUNDED' && <Money value={item.refund} currency={item.currency} />}</li>)}</ul>
        </section>}
      </div>

      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>سفارش <Link href={`/admin/store/orders/${data.order.id}`} className="sa-link num">#{fa(data.order.id)}</Link></h2></header>
          <dl className="rt-facts">
            <div><dt>مشتری</dt><dd>{data.order.customer.name || data.order.customer.email}<small className="sa-sub" dir="ltr">{data.order.customer.phone || data.order.customer.email}</small></dd></div>
            <div><dt>مبلغ سفارش</dt><dd><Money value={data.order.total} currency={data.currency} /></dd></div>
            <div><dt>برگشت‌داده‌شده</dt><dd><Money value={data.order.refunded} currency={data.currency} /></dd></div>
            <div><dt>قابل بازپرداخت</dt><dd><Money value={data.order.remaining} currency={data.currency} /></dd></div>
            {data.order.deliveredAt && <div><dt>تحویل</dt><dd>{faDate(data.order.deliveredAt)}</dd></div>}
            {data.order.invoiceNumber && <div><dt>فاکتور</dt><dd><a href={`/invoice/${data.order.invoiceNumber}`} className="sa-link num" target="_blank" rel="noreferrer">{data.order.invoiceNumber}</a></dd></div>}
          </dl>
        </section>

        {open ? <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>بررسی و اقدام</h2></header>
          <label className="sa-field"><span>پیام برای مشتری {data.status === 'REQUESTED' && '(برای رد کردن الزامی)'}</span><textarea className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={data.kind === 'RETURN' ? 'مثلاً: کالا را با پست پیشتاز به نشانی انبار ارسال کنید و کد رهگیری را در تیکت بفرستید.' : ''} /></label>
          {data.status === 'REQUESTED' && <div className="sa-head-actions">
            <button type="button" className="btn btn-ghost rt-reject" disabled={busy || note.trim().length < 3} onClick={() => void act('reject')}>رد درخواست</button>
            {data.kind === 'RETURN' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act('approve')}>تأیید و انتظار دریافت کالا</button>}
          </div>}
          <hr className="rt-sep" />
          <label className="sa-field"><span>مبلغ بازپرداخت به کیف پول (خالی = مبلغ درخواستی)</span><input className="input num" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={String(data.requested)} /></label>
          <label className="sa-check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />کالا سالم است؛ موجودی به انبار برگردد</label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act('refund')}>{data.kind === 'RETURN' ? 'کالا دریافت شد — واریز به کیف پول' : 'لغو سفارش و واریز به کیف پول'}</button>
          <p className="sa-hint">حداکثر تا مبلغ باقی‌ماندهٔ سفارش واریز می‌شود و هر درخواست فقط یک بار بازپرداخت می‌شود.</p>
        </section> : <section className="sa-card">
          <header className="sa-card-head"><h2>نتیجه</h2></header>
          <dl className="rt-facts">
            {data.status === 'REFUNDED' && <div><dt>واریز به کیف پول</dt><dd><Money value={data.refund} currency={data.currency} /></dd></div>}
            {data.refundedAt && <div><dt>زمان واریز</dt><dd>{faDate(data.refundedAt, true)}</dd></div>}
            {data.decidedAt && <div><dt>زمان تصمیم</dt><dd>{faDate(data.decidedAt, true)}</dd></div>}
            {data.status === 'REFUNDED' && <div><dt>برگشت به انبار</dt><dd>{data.restocked ? 'بله' : 'خیر'}</dd></div>}
          </dl>
          {data.adminNote && <blockquote className="rt-quote">{data.adminNote}</blockquote>}
        </section>}
      </div>
    </div>
    {photo && <div className="rt-lightbox" role="dialog" aria-modal="true" aria-label="عکس مشتری" onClick={() => setPhoto('')}><img src={photo} alt="" /><button type="button" className="btn btn-ghost" onClick={() => setPhoto('')}>بستن</button></div>}
  </StoreShell>
}
