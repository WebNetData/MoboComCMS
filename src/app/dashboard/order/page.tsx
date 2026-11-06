import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import HostingCatalog from '@/components/hosting/HostingCatalog'
import DomainSearch from '@/components/hosting/DomainSearch'
import { publicHostingCatalog } from '@/modules/hosting/server/catalog'
import { hourlyMinHours } from '@/modules/hosting/domain/services'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { getModuleSettings } from '@/extensions/server/modules'
import { serviceOrderingAccess } from '@/modules/account/server/service-ordering'
import { memberServiceCards } from '@/modules/store/server/catalog'
import { publishedOrderForms } from '@/modules/forms/server/service'
import { formatAmount } from '@/shared/money/format'
import { BASE_CURRENCY } from '@/shared/money'
import OrderTrail from './OrderTrail'

const families = [
  { id: 'hosting', title: 'هاست و میزبانی', icon: 'layers', text: 'پلن، دوره و دامنهٔ سایت را انتخاب کنید؛ مدیریت و تمدید در همین حساب است.', owner: 'hosting' },
  { id: 'servers', title: 'سرور مجازی و ابری', icon: 'server', text: 'منابع و هزینه را بررسی کنید؛ سرور دوره‌ای یا ساعتی سفارش دهید.', owner: 'hosting' },
  { id: 'domains', title: 'ثبت و انتقال دامنه', icon: 'globe', text: 'نام دلخواه را جست‌وجو کنید و مشخصات ثبت یا انتقال را کامل کنید.', owner: 'hosting' },
  { id: 'payments', title: 'پرداخت سایت خارجی', icon: 'wallet', text: 'خدمت را انتخاب کنید، مبلغ ارزی و اطلاعات لازم را بدهید و هزینهٔ روز را ببینید.', owner: 'forms' },
  { id: 'digital', title: 'خدمات و محصولات دیجیتال', icon: 'bag', text: 'سرویس‌ها، حساب‌ها و خدمات دیجیتال موجود را انتخاب و سفارش دهید.', owner: 'store' },
  { id: 'forms', title: 'درخواست خدمات', icon: 'file', text: 'فرم خدمت موردنظر را تکمیل کنید؛ پاسخ و پیگیری در درخواست‌های شماست.', owner: 'forms' },
] as const
type Query = { category?: string; q?: string; page?: string }

export default async function OrderDesk({ searchParams }: { searchParams: Promise<Query> }) {
  const [access, input] = await Promise.all([serviceOrderingAccess(), searchParams]), family = families.find(row => row.id === input.category)
  const allowed = !family || family.owner === 'forms' || access[family.owner]
  const q = typeof input.q === 'string' ? input.q.trim().slice(0, 80) : ''
  let content
  if (!allowed) content = <section className="do-empty"><h2>این بخش فعلاً در دسترس شما نیست</h2><p>از سرویس‌های در دسترس انتخاب کنید یا از پشتیبانی حساب خود راهنمایی بگیرید.</p><Link className="btn btn-ghost" href="/dashboard/tickets">پشتیبانی</Link></section>
  else if (family?.id === 'hosting' || family?.id === 'servers') {
    const products = await publicHostingCatalog(family.id), [gateways, settings] = await Promise.all([checkoutGatewayOptions(products[0]?.currency || BASE_CURRENCY), getModuleSettings('hosting')])
    content = <HostingCatalog key={family.id} products={products} gateways={gateways} signedIn minHours={hourlyMinHours(settings)} surface="dashboard" />
  } else if (family?.id === 'domains') content = <section aria-label="جست‌وجو و سفارش دامنه"><DomainSearch signedIn surface="dashboard" /></section>
  else if (family) {
    const foreign = family.id === 'payments', [products, forms] = await Promise.all([access.store && family.id !== 'forms' ? memberServiceCards(q, foreign, Number(input.page) || 1) : null, family.id !== 'digital' ? publishedOrderForms(foreign) : []])
    const shownForms = forms.filter(row => !q || `${row.title} ${row.description}`.includes(q))
    content = <>
      <form key={`${family.id}:${q}:${products?.page || 1}`} className="do-search" role="search"><input type="hidden" name="category" value={family.id} /><label>جست‌وجوی خدمت<input className="input" name="q" maxLength={80} defaultValue={q} placeholder="نام سرویس یا خدمت…" /></label><button className="btn btn-primary" type="submit">جست‌وجو</button>{q && <Link className="btn btn-ghost" href={`/dashboard/order?category=${family.id}`}>پاک‌کردن جست‌وجو</Link>}</form>
      <div className="do-grid">{products?.items.map(item => <article className="do-card" key={`product-${item.id}`}><span className="badge">{foreign ? 'مبلغ به انتخاب شما' : item.category || 'خدمت دیجیتال'}</span><h2>{item.name}</h2>{item.excerpt && <p>{item.excerpt}</p>}{!foreign && <span className="do-price">از {formatAmount(item.price, item.currency, 'fa-IR')}</span>}<p>{foreign ? 'هزینه پس از ورود مبلغ ارزی با نرخ جاری محاسبه می‌شود.' : 'اطلاعات و مبلغ نهایی را پیش از پرداخت بررسی می‌کنید.'}</p><Link className="btn btn-primary" href={`/dashboard/order/products/${encodeURIComponent(item.slug)}`}>انتخاب و تکمیل اطلاعات</Link></article>)}{shownForms.map(form => <article className="do-card" key={`form-${form.slug}`}><span className="badge">درخواست خدمت</span><h2>{form.title}</h2><p>{form.description || 'اطلاعات درخواست را وارد کنید و مبلغ را پیش از پرداخت ببینید.'}</p><Link className="btn btn-primary" href={`/dashboard/order/forms/${encodeURIComponent(form.slug)}`}>تکمیل درخواست</Link></article>)}</div>
      {!products?.items.length && !shownForms.length && <section className="do-empty"><h2>{q ? 'خدمتی با این عبارت پیدا نشد' : 'هنوز خدمتی در این بخش عرضه نشده است'}</h2><p>{q ? 'عبارت کوتاه‌تری جست‌وجو کنید یا دستهٔ دیگری را انتخاب کنید.' : 'خدمات پس از انتشار توسط مدیریت اینجا قابل سفارش می‌شوند؛ برای درخواست اختصاصی با پشتیبانی صحبت کنید.'}</p><Link className="btn btn-ghost" href="/dashboard/tickets">درخواست راهنمایی</Link></section>}
      {products && products.pages > 1 && <nav className="do-pager" aria-label="صفحه‌های خدمات">{products.page > 1 ? <Link className="btn btn-ghost" href={`?category=${family.id}&q=${encodeURIComponent(q)}&page=${products.page - 1}`}>صفحهٔ قبل</Link> : <span />}<span>{products.page.toLocaleString('fa-IR')} از {products.pages.toLocaleString('fa-IR')}</span>{products.page < products.pages && <Link className="btn btn-ghost" href={`?category=${family.id}&q=${encodeURIComponent(q)}&page=${products.page + 1}`}>صفحهٔ بعد</Link>}</nav>}
    </>
  } else content = <div className="do-grid">{families.filter(row => row.owner === 'forms' || access[row.owner]).map(row => <article className="do-card" key={row.id}><span className="do-icon" aria-hidden="true"><Icon name={row.icon} size={24} /></span><h2>{row.title}</h2><p>{row.text}</p><Link className="btn btn-primary" href={`?category=${row.id}`}>انتخاب {row.title}</Link></article>)}</div>
  return <div className="dt-page do-page" dir="rtl"><header className="do-head"><div><h1>{family?.title || 'سفارش جدید'}</h1><p>{family?.text || 'خدمت را انتخاب کنید، اطلاعات را کامل کنید و پیش از پرداخت مبلغ را ببینید؛ وضعیت سفارش در همین داشبورد در دسترس است.'}</p></div><div className="do-links">{family && <Link className="btn btn-ghost" href="/dashboard/order">همهٔ خدمات</Link>}<Link className="btn btn-ghost" href="/dashboard/orders">سفارش‌های من</Link><Link className="btn btn-ghost" href="/dashboard/requests">درخواست‌های من</Link></div></header><OrderTrail />{content}</div>
}
