'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import { StoreIcon } from '@/components/store/StoreIcons'
import { Money } from '@/components/store/Storefront'

type Reason = { key: string; label: string; photos: boolean }
type Line = { line: number; name: string; variantName: string; image: string; kind: string; quantity: number; returnable: number; code: boolean; off: string; unitRefund: number }
type Request = {
  id: number; number: string; kind: 'CANCEL' | 'RETURN'; kindLabel: string; status: string; statusLabel: string; reasonLabel: string; description: string
  photos: string[]; lines: { line: number; quantity: number; name: string }[]; requested: number; refund: number; currency: string; adminNote: string; createdAt: string
}
type Info = {
  eligibility: { cancel: boolean; return: boolean; reason: string; returnUntil: string | null }
  policy: string; windowDays: number; requirePhotos: boolean; autoRefundCancel: boolean
  reasons: { CANCEL: Reason[]; RETURN: Reason[] }; cancelRefund: number; currency: string; lines: Line[]; requests: Request[]
}

const TONE: Record<string, string> = { REQUESTED: 'is-warn', APPROVED: 'is-info', REFUNDED: 'is-ok', REJECTED: 'is-bad', WITHDRAWN: '' }
const fa = (value: number) => value.toLocaleString('fa-IR')
const persian = (value: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date(value))

/** Cancel (before shipping) or return (after delivery) from the order page, with the request history. */
export default function ReturnPanel({ orderId }: { orderId: number }) {
  const router = useRouter()
  const [info, setInfo] = useState<Info | null>(null)
  const [mode, setMode] = useState<'' | 'CANCEL' | 'RETURN'>('')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [chosen, setChosen] = useState<Record<number, number>>({})
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => fetch(`/api/store/orders/${orderId}/returns`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setInfo).catch(() => null), [orderId])
  useEffect(() => { void load() }, [load])
  const previews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  if (!info) return null
  const reasons = mode ? info.reasons[mode] : []
  const selectedReason = reasons.find((item) => item.key === reason)
  const estimate = mode === 'CANCEL' ? info.cancelRefund : info.lines.reduce((sum, line) => sum + line.unitRefund * (chosen[line.line] || 0), 0)
  const needsPhotos = mode === 'RETURN' && info.requirePhotos && !!selectedReason?.photos
  const start = (kind: 'CANCEL' | 'RETURN') => {
    setMode(kind); setReason(''); setDescription(''); setPhotos([]); setError(''); setDone('')
    setChosen(kind === 'RETURN' && info.lines.filter((line) => line.returnable > 0).length === 1 ? { [info.lines.find((line) => line.returnable > 0)!.line]: 1 } : {})
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!mode) return
    if (!reason) { setError('دلیل را انتخاب کنید.'); return }
    if (mode === 'RETURN' && !Object.values(chosen).some((quantity) => quantity > 0)) { setError('کالا و تعداد مرجوعی را انتخاب کنید.'); return }
    if (needsPhotos && !photos.length) { setError('برای این دلیل، دست‌کم یک عکس از کالا بفرستید.'); return }
    setBusy(true); setError('')
    const form = new FormData()
    form.set('kind', mode); form.set('reason', reason); form.set('description', description)
    form.set('lines', JSON.stringify(Object.entries(chosen).filter(([, quantity]) => quantity > 0).map(([line, quantity]) => ({ line: Number(line), quantity }))))
    for (const file of photos) form.append('photos', file)
    const response = await fetch(`/api/store/orders/${orderId}/returns`, { method: 'POST', body: form }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'ثبت درخواست انجام نشد؛ دوباره تلاش کنید.'); return }
    setMode('')
    setDone(data.status === 'REFUNDED' ? `سفارش لغو شد و مبلغ به کیف پول شما برگشت (درخواست ${data.number}).` : `درخواست ${data.number} ثبت شد؛ نتیجهٔ بررسی را از همین صفحه و اعلان‌ها پیگیری کنید.`)
    await load(); router.refresh()
  }

  async function withdraw(id: number) {
    if (!window.confirm('درخواست لغو شود؟')) return
    const response = await fetch(`/api/store/returns/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) { const data = await response?.json().catch(() => null); setError(data?.error || 'انجام نشد'); return }
    await load(); router.refresh()
  }

  const canAct = info.eligibility.cancel || info.eligibility.return
  if (!canAct && !info.requests.length && !done) return info.eligibility.returnUntil ? <p className="rp-hint"><StoreIcon name="clock" size={15} />{info.eligibility.reason}</p> : null

  return <section className="sx-my-card rp" aria-labelledby="rp-title">
    <h2 id="rp-title"><StoreIcon name="receipt" size={17} />لغو و مرجوعی</h2>
    {done && <p className="rp-done" role="status">{done}</p>}

    {info.requests.length > 0 && <ul className="rp-requests">{info.requests.map((item) => <li key={item.id}>
      <div className="rp-req-head"><b>{item.kindLabel} <span className="num" dir="ltr">{item.number}</span></b><span className={`sx-state ${TONE[item.status] || ''}`}>{item.statusLabel}</span></div>
      <small>{persian(item.createdAt)} · {item.reasonLabel}{item.lines.length > 0 && item.kind === 'RETURN' ? ` · ${item.lines.map((line) => `${line.name} (${fa(line.quantity)})`).join('، ')}` : ''}</small>
      {item.status === 'REFUNDED' ? <p className="rp-refund"><StoreIcon name="check" size={14} /><Money amount={item.refund} currency={item.currency} /> به کیف پول شما واریز شد.</p>
        : item.status !== 'REJECTED' && item.status !== 'WITHDRAWN' && <p className="rp-muted">مبلغ قابل بازپرداخت: <Money amount={item.requested} currency={item.currency} /></p>}
      {item.adminNote && <p className="rp-note"><b>پیام فروشگاه:</b> {item.adminNote}</p>}
      {item.status === 'REQUESTED' && <button type="button" className="rp-link" onClick={() => void withdraw(item.id)}>لغو این درخواست</button>}
    </li>)}</ul>}

    {!mode && canAct && <div className="rp-actions">
      {info.eligibility.cancel && <button type="button" className="sx-btn" onClick={() => start('CANCEL')}>لغو سفارش</button>}
      {info.eligibility.return && <button type="button" className="sx-btn" onClick={() => start('RETURN')}>درخواست مرجوعی کالا</button>}
      {info.eligibility.return && info.eligibility.returnUntil && <small className="rp-muted">مهلت مرجوعی تا {persian(info.eligibility.returnUntil)}</small>}
    </div>}
    {!mode && !canAct && info.eligibility.reason && <p className="rp-muted">{info.eligibility.reason}</p>}

    {mode && <form className="rp-form" onSubmit={submit}>
      <h3>{mode === 'CANCEL' ? 'لغو سفارش' : 'درخواست مرجوعی'}</h3>
      {mode === 'RETURN' && <fieldset className="rp-lines">
        <legend>کدام کالا و چند عدد؟</legend>
        {info.lines.map((line) => {
          const value = chosen[line.line] || 0
          const disabled = line.returnable <= 0
          return <div key={line.line} className={`rp-line${value ? ' is-on' : ''}${disabled ? ' is-off' : ''}`}>
            <label><input type="checkbox" disabled={disabled} checked={value > 0} onChange={(e) => setChosen({ ...chosen, [line.line]: e.target.checked ? 1 : 0 })} />
              {line.image ? <img src={line.image} alt="" /> : <span className="rp-ph"><StoreIcon name="box" size={18} /></span>}
              <span><b>{line.name}</b>{line.variantName && <small>{line.variantName}</small>}{disabled ? <small>{line.off}</small> : line.code && <small>کد تحویل‌شده؛ پس از تأیید باطل می‌شود</small>}</span>
            </label>
            {value > 0 && line.returnable > 1 && <span className="rp-qty" role="group" aria-label={`تعداد ${line.name}`}>
              <button type="button" onClick={() => setChosen({ ...chosen, [line.line]: Math.max(1, value - 1) })} aria-label="کم کردن">−</button>
              <b className="num">{fa(value)}</b>
              <button type="button" onClick={() => setChosen({ ...chosen, [line.line]: Math.min(line.returnable, value + 1) })} aria-label="زیاد کردن">+</button>
            </span>}
          </div>
        })}
      </fieldset>}

      <fieldset className="rp-reasons"><legend>دلیل</legend>
        {reasons.map((item) => <label key={item.key} className={reason === item.key ? 'is-on' : ''}><input type="radio" name="reason" value={item.key} checked={reason === item.key} onChange={() => setReason(item.key)} />{item.label}</label>)}
      </fieldset>
      <label className="rp-field"><span>توضیحات {reason === 'other' ? '(الزامی)' : '(اختیاری)'}</span><textarea className="input" rows={3} maxLength={1500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={mode === 'RETURN' ? 'مثلاً کدام قسمت کالا آسیب دیده است' : ''} /></label>

      {mode === 'RETURN' && info.lines.some((line) => !line.code && (chosen[line.line] || 0) > 0) && <div className="rp-field"><span>عکس از کالا و بسته‌بندی {needsPhotos ? '(الزامی)' : '(اختیاری)'} — حداکثر ۵ عکس</span>
        <div className="rp-photos">
          {previews.map((url, index) => <figure key={url}><img src={url} alt={`عکس ${fa(index + 1)}`} /><button type="button" onClick={() => setPhotos(photos.filter((_, i) => i !== index))} aria-label={`حذف عکس ${fa(index + 1)}`}>×</button></figure>)}
          {photos.length < 5 && <label className="rp-add"><StoreIcon name="plus" size={20} /><span>افزودن عکس</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { const files = [...(e.target.files || [])].filter((file) => file.size <= 5 * 1024 * 1024); setPhotos([...photos, ...files].slice(0, 5)); setError(''); e.target.value = '' }} /></label>}
        </div>
      </div>}

      <div className="rp-summary">
        <span>{mode === 'CANCEL' ? (info.autoRefundCancel ? 'مبلغی که فوراً به کیف پول برمی‌گردد' : 'مبلغی که پس از تأیید به کیف پول برمی‌گردد') : 'مبلغ تقریبی بازپرداخت به کیف پول'}</span>
        <Money amount={estimate} currency={info.currency} />
      </div>
      {mode === 'RETURN' && info.policy && info.lines.some((line) => !line.code && (chosen[line.line] || 0) > 0) && <p className="rp-policy">{info.policy}</p>}
      {error && <p className="rp-error" role="alert">{error}</p>}
      <div className="rp-actions">
        <button type="button" className="sx-btn" onClick={() => setMode('')}>انصراف</button>
        <button className="sx-btn is-primary" disabled={busy}>{busy ? 'در حال ثبت…' : mode === 'CANCEL' ? 'لغو سفارش' : 'ثبت درخواست مرجوعی'}</button>
      </div>
    </form>}
  </section>
}
