'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { api, money } from '../client'
import { ErrorNotice } from '../shared'
import s from '../Pay.module.css'

type Event = { id: string; status: string; kind: string; direction: string; amountRial: string | null; referenceLast4: string; occurredFrom: string | null; receivedAt: string }
type Collection = { id: string; invoiceNumber: string; status: 'PENDING' | 'PAID' | 'EXPIRED' | 'REVIEW'; principalRial: string; adjustmentRial: string; collectedRial: string; reviewReason: string; createdAt: string }
type Status = { bankUsername: string; configured: boolean; receivingEnabled: boolean; collectionReady: boolean; lastReceivedAt: string | null; reviewCount: number; events: { total: number; page: number; pages: number; items: Event[] }; collections: { items: Collection[]; total: number; page: number; pages: number } }
const states: Record<string, string> = { ORIGINAL_TRANSFER: 'واریز از فرستندهٔ مجاز', IGNORED: 'غیرقابل تطبیق', REJECTED: 'قالب یا حساب نامعتبر', DUPLICATE: 'تکراری', CONFLICT: 'متعارض' }
const kinds: Record<string, string> = { CARD_TRANSFER: 'انتقال کارت', PAYA: 'پایا', SATNA: 'ساتنا', INTEREST: 'سود سپرده', INTERNET_PURCHASE: 'خرید اینترنتی', TRANSFER_FEE: 'کارمزد انتقال', BALANCE_FEE: 'کارمزد مانده', POS_PURCHASE: 'خرید با پایانه', UNKNOWN: 'نامشخص' }
const collectionStates: Record<Collection['status'], string> = { PENDING: 'در انتظار', PAID: 'پرداخت ثبت‌شده', EXPIRED: 'منقضی', REVIEW: 'نیازمند بررسی' }
const reasons: Record<string, string> = { SOURCE_CHANGED: 'منبع تغییر کرده است', BANK_CONFLICT: 'تعارض پیام بانکی', OUTSIDE_VALID_WINDOW: 'خارج از بازهٔ معتبر', INVOICE_CHANGED: 'فاکتور تغییر کرده است', MERCHANT_BLOCKED: 'پذیرنده در دسترس نیست', PAYER_BLOCKED: 'دسترسی پرداخت‌کننده محدود است', SETTLEMENT_BLOCKED: 'تسویه متوقف است', STOCK_UNAVAILABLE: 'موجودی در دسترس نیست', BALE_INVOICE_CHANGED: 'فاکتور بله تغییر کرده است', BALE_TOPUP_BLOCKED: 'شارژ کیف پول متوقف است' }
const date = (value: string) => new Date(value).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })

export default function BaleStatus() {
  const [data, setData] = useState<Status | null>(null), [page, setPage] = useState(1), [collectionPage, setCollectionPage] = useState(1), [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const refresh = useCallback(() => setReload(n => n + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api<Status>(`/api/admin/mobocom-pay/bale-status?page=${page}&collectionsPage=${collectionPage}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'دریافت وضعیت انجام نشد') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, collectionPage, reload])
  return <section className={`${s.card} ${s.stack}`} aria-labelledby="pay-bale-title" aria-busy={loading}>
    <div className={s.row}>
      <h2 id="pay-bale-title">اتصال سروری بله</h2>
      <button type="button" className={s.secondary} onClick={refresh} disabled={loading}>تازه‌سازی وضعیت بله</button>
    </div>
    <p className={s.muted}>دریافت مستقیم پیام‌های بازوی <bdi dir="ltr">@bam_bmi</bdi> روی سرور، بدون اپ همراه.</p>
    <p className={s.notice}>{data?.collectionReady ? 'دریافت و تطبیق خودکار پرداخت بانکی فعال است. وضعیت هر واریز را در سابقه بررسی کنید.' : 'دریافت خودکار پرداخت بانکی آماده نیست. پیکربندی منبع به‌تنهایی به معنی آمادگی تطبیق خودکار نیست.'}</p>
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
      <section className={s.stack} aria-labelledby="pay-bale-collections">
        <h3 id="pay-bale-collections">پرداخت‌های بانکی بله</h3>
        <p className={s.muted}>نیازمند بررسی: {data.reviewCount.toLocaleString('fa-IR')} · کل پرداخت‌ها: {data.collections.total.toLocaleString('fa-IR')}</p>
        {data.collections.items.length ? <div className={s.tableWrap} tabIndex={0} role="region" aria-label="تاریخچهٔ پرداخت‌های بانکی بله">
          <table className={s.table}>
            <caption>وضعیت ثبت‌شدهٔ پرداخت‌ها و مبلغ‌ها به ریال</caption>
            <thead><tr><th scope="col">فاکتور و زمان</th><th scope="col">مبلغ فاکتور</th><th scope="col">هزینهٔ خدمت</th><th scope="col">مبلغ واریز</th><th scope="col">وضعیت</th></tr></thead>
            <tbody>{data.collections.items.map(item => <tr key={item.id}><td><bdi>{item.invoiceNumber}</bdi><span className={s.tableSub}>{date(item.createdAt)}</span></td><td>{money(item.principalRial)}</td><td>{money(item.adjustmentRial)}</td><td>{money(item.collectedRial)}</td><td>{collectionStates[item.status] || 'نیازمند بررسی'}{item.status === 'REVIEW' && <span className={s.tableSub}>{reasons[item.reviewReason] || 'نیازمند بررسی'}</span>}</td></tr>)}</tbody>
          </table>
        </div> : <p className={s.emptyState}>هنوز پرداخت بانکی ثبت نشده است.</p>}
        <nav className={s.row} aria-label="صفحه‌های پرداخت‌های بانکی بله">
          <button type="button" className={s.secondary} disabled={loading || data.collections.page <= 1} onClick={() => setCollectionPage(n => Math.max(1, n - 1))}>پرداخت‌های جدیدتر</button>
          <span>صفحهٔ {data.collections.page.toLocaleString('fa-IR')} از {data.collections.pages.toLocaleString('fa-IR')}</span>
          <button type="button" className={s.secondary} disabled={loading || data.collections.page >= data.collections.pages} onClick={() => setCollectionPage(n => n + 1)}>پرداخت‌های قدیمی‌تر</button>
        </nav>
      </section>
    </>}
  </section>
}
