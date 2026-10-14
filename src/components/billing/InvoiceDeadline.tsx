'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { CLOSE_REASON_LABEL, currencyFa } from '@/modules/billing/domain/invoice-rules'

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')
const clockFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' })
const clock = (iso: string) => clockFormat.format(new Date(iso))

/** Time left, as "۱ ساعت و ۲۴ دقیقه" / "۳۸ ثانیه"; empty once it has passed. */
function left(ms: number) {
  if (ms <= 0) return ''
  const minutes = Math.floor(ms / 60_000), hours = Math.floor(minutes / 60)
  if (hours >= 24) return `${fa(Math.floor(hours / 24))} روز و ${fa(hours % 24)} ساعت`
  if (hours) return `${fa(hours)} ساعت و ${fa(minutes % 60)} دقیقه`
  if (minutes) return `${fa(minutes)} دقیقه و ${fa(Math.floor(ms / 1000) % 60)} ثانیه`
  return `${fa(Math.floor(ms / 1000))} ثانیه`
}

/**
 * On an unpaid invoice that closes by itself: until when it holds, why, and a live countdown. On an invoice a rule closed:
 * why, and where to order again.
 */
export default function InvoiceDeadline({ status, expiresAt, fxRates, jumpToman, closeAction, closedReason, againHref }: {
  status: string; expiresAt: string | null; fxRates: Record<string, number>; jumpToman: number; closeAction: 'void' | 'delete'; closedReason: string; againHref: string
}) {
  const [now, setNow] = useState<number | null>(null)
  const open = status === 'UNPAID' && Boolean(expiresAt)
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open])
  const codes = Object.keys(fxRates)

  if (status === 'VOID' && closedReason) return (
    <div className="inv-deadline is-closed" role="alert">
      <span className="inv-deadline-icon"><Icon name="clock" size={22} /></span>
      <div>
        <b>این فاکتور به دلیل {CLOSE_REASON_LABEL[closedReason] || 'قانون بستن خودکار'} بسته شد</b>
        <p>{closedReason === 'OVERDUE' ? 'سررسید پرداخت گذشته بود.' : 'قیمت این فاکتور به نرخ ارز وابسته بود. به دلیل نوسانات ارز، لطفاً سفارش را دوباره ثبت کنید تا با نرخ روز قیمت‌گذاری شود.'}</p>
      </div>
      <Link href={againHref} className="btn btn-primary">ثبت دوباره</Link>
    </div>
  )
  if (!open || !expiresAt) return null

  const remaining = now === null ? null : new Date(expiresAt).getTime() - now
  const urgent = remaining !== null && remaining < 15 * 60_000
  return (
    <div className={`inv-deadline${urgent ? ' is-urgent' : ''}`} role="status">
      <span className="inv-deadline-icon"><Icon name="clock" size={22} /></span>
      <div>
        <b>{codes.length ? 'قیمت این فاکتور به نرخ ارز وابسته است' : 'این فاکتور مهلت پرداخت دارد'}</b>
        <p>
          {codes.length ? 'به علت نوسان شدید نرخ ارز، ' : ''}این فاکتور تا <b>{clock(expiresAt)}</b> فعال است و پس از آن {closeAction === 'delete' ? 'بسته و حذف' : 'بسته'} می‌شود.
          {codes.length > 0 && jumpToman > 0 && <> اگر پیش از آن نرخ {codes.map(currencyFa).join(' یا ')} بیش از {fa(jumpToman)} تومان بالا برود، فاکتور زودتر بسته می‌شود و باید دوباره ثبت کنید.</>}
        </p>
        {codes.length > 0 && <p className="inv-deadline-rates">{codes.map((code) => <span key={code}>نرخ {currencyFa(code)} هنگام ثبت: <b>{fa(fxRates[code])}</b> تومان</span>)}</p>}
      </div>
      <div className="inv-deadline-timer" aria-live="off">
        <small>زمان باقی‌مانده</small>
        <b>{remaining === null ? '…' : left(remaining) || 'تمام شد'}</b>
      </div>
    </div>
  )
}
