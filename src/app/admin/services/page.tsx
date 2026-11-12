'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type FormRow = { id: number; title: string; slug: string; published: boolean; paid: boolean; work: Record<string, number>; handlers: string[] }
type ProductRow = { id: number; name: string; slug: string; image: string; active: boolean; price: number; currency: string; openAmount: boolean; asksBuyer: boolean; waiting: number; delivered: number }
type Data = { forms: FormRow[]; products: ProductRow[]; can: { forms: boolean; buildForms: boolean; orders: boolean; catalog: boolean }; totals: { open: number; inProgress: number; unpaid: number; orders: number } }
const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')

/**
 * Services: what the site performs for a customer — forms marked as a service and virtual products marked as a
 * service — with the work waiting on each, and one click to the place where that work is done.
 */
export default function ServicesAdmin() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/api/admin/services', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (response.ok) setData(body); else setError(body?.error || 'بارگذاری خدمات ممکن نشد')
    }).catch(() => setError('ارتباط با سرور برقرار نشد'))
  }, [])

  if (error) return <div className="sa sv" dir="rtl"><div role="alert" className="sa-notice is-error">{error}</div></div>
  if (!data) return <div className="sa sv" dir="rtl"><div className="sa-skeleton" aria-busy="true" /></div>
  const { totals, can } = data
  return <div className="sa sv" dir="rtl">
    <header className="sa-head"><div><h1>خدمات</h1><p className="sa-hint">هر کاری که برای مشتری انجام می‌دهید — با فرم‌ساز یا به‌صورت محصول مجازی — و کارهایی که روی هر کدام منتظر است.</p></div>
      <div className="sa-head-actions">
        {can.buildForms && <Link href="/admin/forms" className="btn btn-ghost">فرم‌ساز</Link>}
        {can.forms && <Link href="/admin/forms?tab=queue" className="btn btn-primary">صف کار</Link>}
      </div></header>

    <div className="sv-tiles">
      <div className="sv-tile is-warn"><b className="num">{fa(totals.open)}</b><span>درخواست در انتظار کارشناس</span></div>
      <div className="sv-tile is-info"><b className="num">{fa(totals.inProgress)}</b><span>درخواست در حال انجام</span></div>
      <div className="sv-tile is-muted"><b className="num">{fa(totals.unpaid)}</b><span>درخواست پرداخت‌نشده</span></div>
      <div className="sv-tile is-good"><b className="num">{fa(totals.orders)}</b><span>سفارش خدمت، منتظر انجام</span></div>
    </div>

    {can.forms && <section className="sv-section" aria-labelledby="sv-forms">
      <header><h2 id="sv-forms">خدمات فرمی</h2><small>فرم‌هایی که در تنظیماتشان «این فرم یک خدمت است» را زده‌اید</small></header>
      {!data.forms.length ? <p className="sv-empty">هنوز فرمی به‌عنوان خدمت علامت نخورده است. {can.buildForms ? <>در <Link href="/admin/forms" className="sa-link">فرم‌ساز</Link>، زبانهٔ «تنظیمات» فرم را باز کنید و «این فرم یک خدمت است» را بزنید.</> : 'مدیر فرم‌ها می‌تواند فرم‌ها را به‌عنوان خدمت علامت بزند.'}</p>
        : <div className="sv-grid">{data.forms.map((form) => {
            const waiting = form.work.OPEN + form.work.IN_PROGRESS
            return <article key={form.id} className={`sv-card${waiting ? ' has-work' : ''}`}>
              <div className="sv-card-head"><span className="sv-icon" aria-hidden="true">✦</span><div><h3>{form.title}</h3><small>{form.published ? 'منتشرشده' : 'پیش‌نویس'}{form.paid ? ' · با پرداخت' : ''}</small></div></div>
              <dl className="sv-stats">
                <div className={form.work.OPEN ? 'is-warn' : ''}><dt>در انتظار</dt><dd className="num">{fa(form.work.OPEN)}</dd></div>
                <div className={form.work.IN_PROGRESS ? 'is-info' : ''}><dt>در حال انجام</dt><dd className="num">{fa(form.work.IN_PROGRESS)}</dd></div>
                <div><dt>انجام‌شده</dt><dd className="num">{fa(form.work.DONE)}</dd></div>
                {form.paid && <div><dt>پرداخت‌نشده</dt><dd className="num">{fa(form.work.UNPAID)}</dd></div>}
              </dl>
              <p className="sv-who">{form.handlers.length ? <>کارشناسان: <b>{form.handlers.join('، ')}</b></> : 'کارشناس مشخصی ندارد؛ هر کارمندِ دارای دسترسی درخواست‌ها می‌تواند بردارد.'}</p>
              <div className="sv-actions">
                <Link href={`/admin/forms?form=${form.id}&tab=inbox`} className="btn btn-primary btn-sm">درخواست‌ها{waiting ? ` (${fa(waiting)})` : ''}</Link>
                {!form.paid && <Link href={`/admin/forms/counter?form=${form.id}`} className="btn btn-ghost btn-sm">ثبت حضوری</Link>}
                {can.buildForms && <Link href={`/admin/forms?form=${form.id}`} className="btn btn-ghost btn-sm">ویرایش فرم</Link>}
                {form.published && <Link href={`/forms/${form.slug}`} target="_blank" className="btn btn-ghost btn-sm">مشاهده ↗</Link>}
              </div>
            </article>
          })}</div>}
    </section>}

    {(can.orders || can.catalog) && <section className="sv-section" aria-labelledby="sv-products">
      <header><h2 id="sv-products">خدمات فروشگاهی</h2><small>محصولات مجازی که در ویرایش محصول «این محصول یک خدمت است» را زده‌اید</small></header>
      {!data.products.length ? <p className="sv-empty">هنوز محصولی به‌عنوان خدمت علامت نخورده است. {can.catalog ? <>در <Link href="/admin/store/products" className="sa-link">محصولات</Link>، یک محصول مجازی را باز کنید و در کادر «انتشار» این گزینه را بزنید.</> : 'مدیر محصولات می‌تواند محصول مجازی را به‌عنوان خدمت علامت بزند.'}</p>
        : <div className="sv-grid">{data.products.map((product) => <article key={product.id} className={`sv-card${product.waiting ? ' has-work' : ''}`}>
            <div className="sv-card-head">{product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="sv-icon" aria-hidden="true">◆</span>}<div><h3>{product.name}</h3><small>{product.active ? 'در فروشگاه' : 'غیرفعال'}{product.openAmount ? ' · مبلغ دلخواه' : ''}{product.asksBuyer ? ' · اطلاعات از خریدار' : ''}</small></div></div>
            <dl className="sv-stats">
              <div className={product.waiting ? 'is-warn' : ''}><dt>منتظر انجام</dt><dd className="num">{fa(product.waiting)}</dd></div>
              <div><dt>انجام‌شده</dt><dd className="num">{fa(product.delivered)}</dd></div>
              <div><dt>{product.openAmount ? 'قیمت نمونه' : 'قیمت'}</dt><dd className="num">{fa(product.price)}</dd></div>
            </dl>
            <div className="sv-actions">
              {can.orders && <Link href={`/admin/store/orders?tab=new&q=${encodeURIComponent(product.name)}`} className="btn btn-primary btn-sm">سفارش‌ها{product.waiting ? ` (${fa(product.waiting)})` : ''}</Link>}
              {can.catalog && <Link href={`/admin/store/products/${product.id}`} className="btn btn-ghost btn-sm">ویرایش محصول</Link>}
              <Link href={`/products/${product.slug}`} target="_blank" className="btn btn-ghost btn-sm">مشاهده ↗</Link>
            </div>
          </article>)}</div>}
    </section>}
  </div>
}
