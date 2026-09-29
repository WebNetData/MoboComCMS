'use client'

import { useCallback, useEffect, useState } from 'react'
import { call, faDate, faNum, toman } from '../SellerContext'

type Line = {
  id: number; orderId: number; createdAt: string; name: string; variantName: string; sku: string; image: string; quantity: number; total: number; commission: number
  status: string; statusLabel: string; tracking: string; delivery: string; city: string; deliveryDate: string; recipient: { name: string; phone: string; address: string } | null
}
type Data = { open: number; total: number; page: number; pages: number; shipsDirectly: boolean; lines: Line[] }

const TABS = [['open', 'در انتظار اقدام'], ['shipped', 'ارسال‌شده'], ['all', 'همه'], ['refunded', 'برگشت‌خورده']] as const
const TONE: Record<string, string> = { '': 'is-warn', ACCEPTED: 'is-info', READY: 'is-info', SHIPPED: 'is-ok' }
const DELIVERY: Record<string, string> = { PENDING: 'در صف', PROCESSING: 'در حال پردازش', PACKED: 'بسته‌بندی', SHIPPED: 'ارسال شد', DELIVERED: 'تحویل شد', RETURNED: 'مرجوع', CANCELLED: 'لغو' }

function LineActions({ line, shipsDirectly, onDone }: { line: Line; shipsDirectly: boolean; onDone: (ok: boolean, text: string) => void }) {
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)
  async function move(to: string) {
    setBusy(true)
    const result = await call('/api/seller/orders', 'POST', { lineId: line.id, to, tracking })
    setBusy(false)
    onDone(result.ok, result.ok ? `«${line.name}»: ${to === 'ACCEPTED' ? 'تأیید شد' : to === 'READY' ? 'آمادهٔ ارسال شد' : 'ارسال شد'}` : result.error)
  }
  if (line.status === '') return <div className="sl-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void move('ACCEPTED')}>تأیید سفارش</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void move('READY')}>آمادهٔ ارسال</button></div>
  if (line.status === 'ACCEPTED') return <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void move('READY')}>آمادهٔ ارسال شد</button>
  if (line.status === 'READY') return <div className="sl-actions">{shipsDirectly && <input className="input" dir="ltr" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="کد رهگیری پست" aria-label="کد رهگیری" />}<button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void move('SHIPPED')}>{shipsDirectly ? 'ارسال شد' : 'تحویل انبار شد'}</button></div>
  return line.tracking ? <small className="sa-sub" dir="ltr">{line.tracking}</small> : null
}

export default function SellerOrders() {
  const [tab, setTab] = useState('open')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const load = useCallback(async () => {
    const response = await fetch(`/api/seller/orders?tab=${tab}&page=${page}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) setData(await response.json())
  }, [tab, page])
  useEffect(() => { void load() }, [load])

  return <div className="sa">
    <header className="sa-head"><div><h1>سفارش‌ها</h1><p className="sa-hint">{data?.shipsDirectly ? 'سفارش‌ها را تأیید کنید، بسته‌بندی کنید و با ثبت کد رهگیری ارسال کنید.' : 'سفارش‌ها را تأیید و آمادهٔ ارسال کنید؛ پس از تحویل به انبار، ارسال به مشتری با فروشگاه است.'}</p></div></header>
    <nav className="sa-subtabs" aria-label="وضعیت">{TABS.map(([value, label]) => <button key={value} type="button" className={tab === value ? 'is-active' : ''} aria-pressed={tab === value} onClick={() => { setTab(value); setPage(1) }}>{label}{value === 'open' && data?.open ? ` (${faNum(data.open)})` : ''}</button>)}</nav>
    {notice && <p className={`sa-notice ${notice.ok ? 'is-ok' : 'is-error'}`} role="status">{notice.text}</p>}
    {!data ? <div className="sa-skeleton" /> : <div className="sl-orders">
      {data.lines.map((line) => <article key={line.id} className="sa-card sl-order">
        <div className="sl-order-main">
          {line.image ? <img src={line.image} alt="" width={64} height={64} /> : <span className="sa-prod-ph" />}
          <div>
            <b>{line.name}{line.variantName ? ` — ${line.variantName}` : ''}</b>
            <small className="sa-sub">سفارش #{faNum(line.orderId)} · {faDate(line.createdAt)} · تعداد {faNum(line.quantity)}{line.sku ? ` · ${line.sku}` : ''}</small>
            <small className="sa-sub">مبلغ {toman(line.total)}{line.commission ? ` · کارمزد ${toman(line.commission)}` : ''}{line.city ? ` · مقصد: ${line.city}` : ''}{line.deliveryDate ? ` · تحویل ${faDate(line.deliveryDate)}` : ''}</small>
            {line.recipient && <small className="sa-sub sl-recipient">گیرنده: {line.recipient.name} · <bdi dir="ltr">{line.recipient.phone}</bdi> · {line.recipient.address}</small>}
          </div>
        </div>
        <div className="sl-order-side">
          <span className={`sa-state ${TONE[line.status] || ''}`}>{line.statusLabel}</span>
          {line.delivery && <small className="sa-sub">مرسوله: {DELIVERY[line.delivery] || line.delivery}</small>}
          {tab !== 'refunded' && <LineActions line={line} shipsDirectly={data.shipsDirectly} onDone={(ok, text) => { setNotice({ ok, text }); void load() }} />}
        </div>
      </article>)}
      {!data.lines.length && <p className="sa-card sa-empty">{tab === 'open' ? 'سفارشی منتظر اقدام نیست. 🎉' : 'سفارشی در این بخش نیست.'}</p>}
      {data.pages > 1 && <nav className="sa-pager" aria-label="صفحه‌بندی"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span className="num">{faNum(page)} از {faNum(data.pages)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button></nav>}
    </div>}
  </div>
}
