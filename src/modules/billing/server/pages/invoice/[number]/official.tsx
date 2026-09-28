import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import PrintButton from '@/components/PrintButton'
import { officialInvoice } from '@/modules/billing/server/official-invoice'

const n = (value: string | number) => (typeof value === 'number' ? value : Number(value)).toLocaleString('fa-IR')
const money = (value: string) => { try { return BigInt(value).toLocaleString('fa-IR') } catch { return value } }
const date = (value: Date | null) => value ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).format(value) : '—'
const STATUS: Record<string, string> = { PAID: 'پرداخت‌شده', UNPAID: 'پرداخت‌نشده', REFUNDED: 'برگشت‌داده‌شده', VOID: 'باطل‌شده', DRAFT: 'پیش‌نویس' }

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  return { title: `صورتحساب ${(await params).number}`, robots: { index: false } }
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return <div className="oi-field"><span>{label}:</span><b dir={ltr ? 'ltr' : undefined}>{value || '—'}</b></div>
}

/** Official sales invoice (صورتحساب فروش کالا و خدمات), A4 landscape, print or "Save as PDF". */
export default async function OfficialInvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const number = decodeURIComponent((await params).number)
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) redirect(`/login?next=${encodeURIComponent(`/invoice/${number}/official`)}`)
  const doc = await officialInvoice(number, { id: Number(user.id), admin: user.role === 'ADMIN' })
  if (!doc) notFound()
  const s = doc.seller
  return <div className="oi-page" dir="rtl">
    <div className="oi-toolbar no-print">
      <Link href={`/invoice/${doc.number}`} className="btn btn-ghost">← بازگشت به فاکتور</Link>
      <span className="oi-tip">برای فایل PDF، در پنجرهٔ چاپ مقصد را «Save as PDF» انتخاب کنید.</span>
      <PrintButton label="چاپ / ذخیرهٔ PDF" />
    </div>

    <article className="oi-sheet" aria-label={`صورتحساب ${doc.number}`}>
      <header className="oi-head">
        <div className="oi-brand">{s.logo ? <img src={s.logo} alt="" /> : <span className="oi-mark">{(s.sellerName || 'م').slice(0, 1)}</span>}</div>
        <div className="oi-title"><h1>صورتحساب فروش کالا و خدمات</h1>{doc.status !== 'PAID' && <span className={`oi-status is-${doc.status.toLowerCase()}`}>{STATUS[doc.status] || doc.status}</span>}</div>
        <dl className="oi-ids">
          <div><dt>شمارهٔ سریال</dt><dd dir="ltr">{doc.number}</dd></div>
          <div><dt>تاریخ صدور</dt><dd>{date(doc.issuedAt)}</dd></div>
          {doc.orderId && <div><dt>شمارهٔ سفارش</dt><dd>{n(doc.orderId)}</dd></div>}
        </dl>
      </header>

      <section className="oi-party">
        <h2>مشخصات فروشنده</h2>
        <div className="oi-grid">
          <Field label="نام شخص حقیقی / حقوقی" value={s.sellerName} />
          <Field label="شناسهٔ ملی / کد ملی" value={s.nationalId ? n(s.nationalId).replace(/٬/g, '') : ''} />
          <Field label="کد اقتصادی" value={s.economicCode ? n(s.economicCode).replace(/٬/g, '') : ''} />
          <Field label="شمارهٔ ثبت" value={s.registrationNo} />
          <Field label="استان" value={s.province} />
          <Field label="شهر" value={s.city} />
          <Field label="کد پستی" value={s.postalCode ? n(s.postalCode).replace(/٬/g, '') : ''} />
          <Field label="تلفن" value={s.phone} ltr />
          <div className="oi-field is-wide"><span>نشانی:</span><b>{s.address || '—'}</b></div>
        </div>
      </section>

      <section className="oi-party">
        <h2>مشخصات خریدار</h2>
        <div className="oi-grid">
          <Field label="نام شخص حقیقی / حقوقی" value={doc.buyer.name} />
          <Field label="کد ملی / شناسهٔ ملی" value={doc.buyer.nationalId ? n(doc.buyer.nationalId).replace(/٬/g, '') : ''} />
          <Field label="تلفن" value={doc.buyer.phone} ltr />
          <Field label="کد پستی" value={doc.buyer.postalCode ? n(doc.buyer.postalCode).replace(/٬/g, '') : ''} />
          <Field label="استان" value={doc.buyer.province} />
          <Field label="شهر" value={doc.buyer.city} />
          <div className="oi-field is-wide"><span>نشانی:</span><b>{doc.buyer.address || '—'}</b></div>
        </div>
      </section>

      <section className="oi-items">
        <h2>مشخصات کالا یا خدمات مورد معامله <small>(مبالغ به {doc.unitLabel})</small></h2>
        <table>
          <thead><tr>
            <th>ردیف</th><th>کد کالا</th><th className="is-desc">شرح کالا یا خدمات</th><th>تعداد</th><th>مبلغ واحد</th><th>مبلغ کل</th>
            <th>مبلغ تخفیف</th><th>مبلغ کل پس از تخفیف</th><th>جمع مالیات و عوارض ارزش افزوده{doc.vatPercent ? ` (${n(doc.vatPercent)}٪)` : ''}</th><th>جمع کل</th>
          </tr></thead>
          <tbody>
            {doc.rows.map((row) => <tr key={row.index}>
              <td>{n(row.index)}</td><td dir="ltr">{row.code || '—'}</td><td className="is-desc">{row.description}</td><td>{n(row.quantity)}</td>
              <td>{money(row.unit)}</td><td>{money(row.gross)}</td><td>{money(row.discount)}</td><td>{money(row.net)}</td><td>{money(row.vat)}</td><td><b>{money(row.total)}</b></td>
            </tr>)}
          </tbody>
          <tfoot><tr>
            <td colSpan={5} className="is-label">جمع کل</td><td>{money(doc.totals.gross)}</td><td>{money(doc.totals.discount)}</td><td>{money(doc.totals.net)}</td><td>{money(doc.totals.vat)}</td><td><b>{money(doc.totals.total)}</b></td>
          </tr></tfoot>
        </table>
        <p className="oi-words"><span>مبلغ قابل پرداخت به حروف:</span> <b>{doc.totalWords}</b></p>
      </section>

      <section className="oi-foot">
        <div className="oi-terms">
          <p><b>شرایط و نحوهٔ فروش:</b> {doc.status === 'PAID' ? `نقدی — پرداخت‌شده${doc.paidAt ? ` در ${date(doc.paidAt)}` : ''}${doc.payment ? ` از طریق ${doc.payment}` : ''}` : STATUS[doc.status] || doc.status}{doc.walletApplied && ` (${money(doc.walletApplied)} ${doc.unitLabel} از کیف پول)`}</p>
          <p>{doc.pricesIncludeVat ? 'قیمت‌ها با احتساب مالیات بر ارزش افزوده است.' : 'مالیات بر ارزش افزوده به قیمت‌ها اضافه شده است.'}</p>
          {s.footerNote && <p>{s.footerNote}</p>}
        </div>
        <div className="oi-sign">
          <div><span>مهر و امضای فروشنده</span>{s.stamp && <img src={s.stamp} alt="مهر فروشنده" />}</div>
          <div><span>مهر و امضای خریدار</span></div>
        </div>
      </section>
    </article>
  </div>
}
