'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { api, money } from '../client'
import { ErrorNotice } from '../shared'
import s from '../Pay.module.css'

type Event = { id: string; status: string; kind: string; direction: string; amountRial: string | null; referenceLast4: string; occurredFrom: string | null; receivedAt: string }
type Status = { bankUsername: string; configured: boolean; receivingEnabled: boolean; collectionReady: false; lastReceivedAt: string | null; events: { total: number; page: number; pages: number; items: Event[] } }
const states: Record<string, string> = { ORIGINAL_TRANSFER: 'واریز از فرستندهٔ مجاز', IGNORED: 'غیرقابل تطبیق', REJECTED: 'قالب یا حساب نامعتبر', DUPLICATE: 'تکراری', CONFLICT: 'متعارض' }
const kinds: Record<string, string> = { CARD_TRANSFER: 'انتقال کارت', PAYA: 'پایا', SATNA: 'ساتنا', INTEREST: 'سود سپرده', INTERNET_PURCHASE: 'خرید اینترنتی', TRANSFER_FEE: 'کارمزد انتقال', BALANCE_FEE: 'کارمزد مانده', POS_PURCHASE: 'خرید با پایانه', UNKNOWN: 'نامشخص' }
const date = (value: string) => new Date(value).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })

export default function BaleStatus() {
  const [data, setData] = useState<Status | null>(null), [page, setPage] = useState(1), [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const refresh = useCallback(() => setReload(n => n + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api<Status>(`/api/admin/mobocom-pay/bale-status?page=${page}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'دریافت وضعیت انجام نشد') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, reload])
  return <section className={`${s.card} ${s.stack}`} aria-labelledby="pay-bale-title" aria-busy={loading}>
    <div className={s.row}>
      <h2 id="pay-bale-title">اتصال سروری بله</h2>
      <button type="button" className={s.secondary} onClick={refresh} disabled={loading}>تازه‌سازی وضعیت بله</button>
    </div>
    <p className={s.muted}>دریافت مستقیم پیام‌های بازوی <bdi dir="ltr">@bam_bmi</bdi> روی سرور، بدون اپ همراه.</p>
    <p className={s.notice}>تأیید خودکار فاکتور هنوز فعال نیست. پیام‌های این بخش برای بررسی ثبت می‌شوند و موجودی یا وضعیت پرداخت را تغییر نمی‌دهند.</p>
    <ErrorNotice error={error} />
    <p role="status">{loading ? 'در حال دریافت وضعیت…' : data ? data.receivingEnabled ? 'دریافت سروری فعال است؛ اتصال زنده باید روی سرور آزموده شود.' : data.configured ? 'اتصال تنظیم شده؛ حساب مقصد یا API غیرفعال است.' : 'اتصال حساب بله روی سرور تنظیم نشده است.' : 'وضعیت در دسترس نیست.'}</p>
    {data && !loading && !error && <>
      <p className={s.muted}>آخرین پیام ثبت‌شده: {data.lastReceivedAt ? date(data.lastReceivedAt) : 'هنوز پیامی ثبت نشده'} · زمان‌ها به وقت تهران</p>
      <Link className={s.secondary} href="/admin/gateways">مدیریت درگاه‌های پلتفرم</Link>
      {data.events.items.length ? <div className={s.tableWrap} tabIndex={0} role="region" aria-label="تاریخچهٔ پیام‌های بانکی بله">
        <table className={s.table}>
          <caption>پیام‌های بانکی؛ بدون تأیید مالی</caption>
          <thead><tr><th scope="col">زمان ثبت</th><th scope="col">نوع تراکنش</th><th scope="col">مبلغ (ریال)</th><th scope="col">وضعیت</th></tr></thead>
          <tbody>{data.events.items.map(event => <tr key={event.id}>
            <td>{date(event.receivedAt)}{event.occurredFrom && <span className={s.tableSub}>زمان بانک: {date(event.occurredFrom)}</span>}</td>
            <td>{kinds[event.kind] || 'نامشخص'}<span className={s.tableSub}>{event.direction === 'CREDIT' ? 'واریز' : event.direction === 'DEBIT' ? 'برداشت' : 'جهت نامشخص'}{event.referenceLast4 && ` · پایان پیگیری: ${event.referenceLast4}`}</span></td>
            <td>{event.amountRial ? money(event.amountRial) : '—'}</td><td>{states[event.status] || 'نیازمند بررسی'}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className={s.emptyState}>هنوز پیامی از اتصال سروری ثبت نشده است.</p>}
      <nav className={s.row} aria-label="صفحه‌های پیام‌های بانکی بله">
        <button type="button" className={s.secondary} disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)}>پیام‌های جدیدتر</button>
        <span>صفحهٔ {data.events.page.toLocaleString('fa-IR')} از {data.events.pages.toLocaleString('fa-IR')}</span>
        <button type="button" className={s.secondary} disabled={loading || page >= data.events.pages} onClick={() => setPage(n => n + 1)}>پیام‌های قدیمی‌تر</button>
      </nav>
    </>}
  </section>
}
