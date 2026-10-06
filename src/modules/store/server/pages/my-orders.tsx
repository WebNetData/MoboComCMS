import Link from '@/components/AppLink'
import { notFound, redirect } from 'next/navigation'
import { getViewer } from '@/modules/membership/server/membership'
import { CUSTOMER_TABS, customerOrder, customerOrders, customerServiceOrders, type CustomerTab } from '@/modules/store/server/orders'
import { FULFILMENT_LABEL, TRACKING_STEPS, isFulfilmentStatus, trackingIndex } from '@/modules/store/domain/store'
import { StoreIcon } from '@/components/store/StoreIcons'
import { Money } from '@/components/store/Storefront'
import ReturnPanel from '@/components/store/ReturnPanel'
import RateSellers from '@/components/marketplace/RateSellers'
import { orderShipment } from '@/modules/shipping/server/carriers'
import { buyerCodes } from '@/modules/store/server/digital-codes'
import CopyText from '@/components/software/CopyText'

const fa = (value: number) => value.toLocaleString('fa-IR')
const persian = (value: Date | string, time = false) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Tehran' }).format(new Date(value))
const persianDay = (day: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
const EVENT_LABEL: Record<string, string> = {
  PAID: 'پرداخت شد', NOTE: 'پیام فروشگاه', ...FULFILMENT_LABEL, PENDING: 'ثبت سفارش',
  CANCEL_REQUESTED: 'درخواست لغو', RETURN_REQUESTED: 'درخواست مرجوعی', RETURN_APPROVED: 'مرجوعی تأیید شد', RETURN_REJECTED: 'درخواست رد شد',
  RETURN_WITHDRAWN: 'درخواست لغو شد', REFUNDED: 'برگشت وجه به کیف پول',
}

async function userId(next: string) {
  const viewer = await getViewer()
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(next)}`)
  return viewer.userId
}

/** /dashboard/orders — Digikala-style order history with status tabs. */
export async function MyOrdersView({ tab: tabParam }: { tab?: string }) {
  const id = await userId('/dashboard/orders')
  const tab = (CUSTOMER_TABS.some((item) => item.key === tabParam) ? tabParam : 'current') as CustomerTab
  const [{ orders, counts }, services] = await Promise.all([customerOrders(id, tab), customerServiceOrders(id)])
  return <div className="sx-my" dir="rtl">
    <header className="sx-my-head"><h1>سفارش‌های من</h1><Link href="/products" className="sx-link">ادامهٔ خرید<StoreIcon name="chevron" size={15} /></Link></header>
    <nav className="sx-my-tabs" aria-label="وضعیت سفارش‌ها">{CUSTOMER_TABS.map((item) => <Link key={item.key} href={`/dashboard/orders?tab=${item.key}`} className={item.key === tab ? 'is-active' : ''} aria-current={item.key === tab ? 'page' : undefined}>
      {item.label}{counts[item.key] > 0 && <span className="num">{fa(counts[item.key])}</span>}
    </Link>)}</nav>
    {orders.length === 0 ? <div className="sx-empty"><StoreIcon name="receipt" size={40} /><b>سفارشی در این بخش ندارید</b><Link href="/products" className="sx-btn">رفتن به فروشگاه</Link></div>
      : <ul className="sx-my-list">{orders.map((order) => <li key={order.id}>
        <Link href={`/dashboard/orders/${order.id}`} className="sx-my-order">
          <div className="sx-my-order-top">
            <span className={`sx-state is-${order.state.tone}`}>{order.state.label}</span>
            <StoreIcon name="chevron" size={18} />
          </div>
          <dl className="sx-my-order-meta">
            <div><dt>تاریخ</dt><dd>{persian(order.createdAt)}</dd></div>
            <div><dt>کد سفارش</dt><dd className="num">{fa(order.id)}</dd></div>
            <div><dt>مبلغ</dt><dd><Money amount={order.total} currency={order.currency} /></dd></div>
          </dl>
          <ul className="sx-my-thumbs" aria-label="کالاها">{order.lines.slice(0, 6).map((line, index) => <li key={index} title={line.name}>{line.image ? <img src={line.image} alt={line.name} loading="lazy" /> : <StoreIcon name="box" size={22} />}{line.quantity > 1 && <span className="num">{fa(line.quantity)}</span>}</li>)}{order.lines.length > 6 && <li className="is-more num">+{fa(order.lines.length - 6)}</li>}</ul>
        </Link>
      </li>)}</ul>}
    {services.length > 0 && <section className="sx-my-services">
      <h2>سایر سفارش‌ها</h2>
      <table className="data"><thead><tr><th>#</th><th>عنوان</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th><th /></tr></thead><tbody>
        {services.map((row) => <tr key={row.id}><td className="num">{fa(row.id)}</td><td>{row.title}</td><td><Money amount={row.total} currency={row.currency} /></td><td>{row.status === 'PAID' ? 'پرداخت‌شده' : row.status === 'PENDING' ? 'در انتظار پرداخت' : 'ناموفق'}</td><td>{persian(row.createdAt)}</td><td>{row.invoiceNumber && <Link href={`/invoice/${row.invoiceNumber}`} className="sx-link">فاکتور</Link>}</td></tr>)}
      </tbody></table>
    </section>}
  </div>
}

/** /dashboard/orders/:id — tracking stepper, items, address, delivery time and totals. */
export async function MyOrderView({ id: idParam }: { id: string }) {
  const id = Number(idParam)
  const user = await userId(`/dashboard/orders/${idParam}`)
  const order = Number.isSafeInteger(id) && id > 0 ? await customerOrder(user, id) : null
  if (!order) notFound()
  const shipment = await orderShipment(order.id).catch(() => null)
  // Codes delivered by the product's own pool are the buyer's as soon as the order is paid.
  const codes = await buyerCodes(user, order.id).catch(() => [])
  const closed = order.fulfilment === 'CANCELLED' || order.fulfilment === 'RETURNED' || order.state.key === 'CANCELLED'
  const step = order.state.key === 'UNPAID' ? -1 : order.fulfilment === 'DELIVERED' ? TRACKING_STEPS.length : trackingIndex(order.fulfilment || 'PENDING')
  return <div className="sx-my sx-my-detail" dir="rtl">
    <header className="sx-my-head">
      <div><Link href="/dashboard/orders" className="sx-link"><StoreIcon name="chevron" size={15} />سفارش‌ها</Link><h1>جزئیات سفارش <span className="num">{fa(order.id)}</span></h1></div>
      <span className={`sx-state is-${order.state.tone}`}>{order.state.label}</span>
    </header>
    <dl className="sx-my-facts">
      <div><dt>تاریخ ثبت</dt><dd>{persian(order.createdAt, true)}</dd></div>
      <div><dt>مبلغ کل</dt><dd><Money amount={order.total} currency={order.currency} /></dd></div>
      {order.invoiceNumber && <div><dt>فاکتور</dt><dd><Link href={`/invoice/${order.invoiceNumber}`} className="sx-link num">{order.invoiceNumber}</Link></dd></div>}
      {order.trackingCode && <div><dt>کد رهگیری مرسوله</dt><dd className="num" dir="ltr">{order.trackingCode}</dd></div>}
    </dl>
    {order.paymentUrl && <div className="sx-alert is-warn"><span>این سفارش هنوز پرداخت نشده است.</span><a href={order.paymentUrl} className="sx-btn is-primary">پرداخت سفارش</a></div>}
    {!closed && step >= 0 && <ol className="sx-track" aria-label="مراحل سفارش">{TRACKING_STEPS.map((item, index) => <li key={item.status} className={index < step ? 'is-done' : index === step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}>
      <span className="sx-track-dot">{index < step ? <StoreIcon name="check" size={14} /> : fa(index + 1)}</span><b>{item.label}</b>
    </li>)}</ol>}
    {codes.length > 0 && <section className="sx-my-card sx-my-codes" aria-label="کدهای خریداری‌شده">
      <h2><StoreIcon name="bolt" size={17} />کدهای شما</h2>
      <p className="sx-my-codes-note">این کدها فقط به شما نشان داده می‌شوند؛ آن‌ها را در اختیار دیگران نگذارید.</p>
      {codes.map((line, index) => <div key={index} className="sx-my-code-line">
        <b>{line.name}{line.variantName && <small> · {line.variantName}</small>}</b>
        <ul>{line.codes.map((code) => <li key={code}><CopyText value={code} label="کد" /></li>)}</ul>
      </div>)}
    </section>}
    <div className="sx-my-grid">
      <section className="sx-my-card">
        <h2>کالاها <small className="num">({fa(order.lines.reduce((sum, line) => sum + line.quantity, 0))})</small></h2>
        <ul className="sx-my-lines">{order.lines.map((line, index) => <li key={index}>
          {line.image ? <img src={line.image} alt="" loading="lazy" /> : <span className="sx-my-ph"><StoreIcon name="box" size={24} /></span>}
          <div>{line.slug ? <Link href={`/products/${line.slug}`}>{line.name}</Link> : <b>{line.name}</b>}{line.variantName && <small>{line.variantName}</small>}<small className="num">{fa(line.quantity)} عدد × <Money amount={line.unitPrice} currency={order.currency} /></small></div>
          <Money amount={line.total} currency={order.currency} />
        </li>)}</ul>
      </section>
      <aside className="sx-my-side">
        {order.address && <section className="sx-my-card"><h2><StoreIcon name="pin" size={17} />آدرس تحویل</h2><p>{order.address.address}</p><dl className="sx-my-kv"><div><dt>گیرنده</dt><dd>{order.address.recipient}</dd></div><div><dt>موبایل</dt><dd className="num" dir="ltr">{order.address.phone}</dd></div>{order.address.postalCode && <div><dt>کد پستی</dt><dd className="num">{order.address.postalCode}</dd></div>}</dl></section>}
        {shipment && shipment.status !== 'CANCELLED' && <section className="sx-my-card">
          <h2><StoreIcon name="truck" size={17} />ارسال مرسوله</h2>
          <dl className="sx-my-kv">
            <div><dt>شرکت حمل</dt><dd>{shipment.carrierName}</dd></div>
            <div><dt>وضعیت</dt><dd>{shipment.statusLabel}</dd></div>
            <div><dt>شمارهٔ بارنامه</dt><dd><Link href={`/track/${shipment.waybill}`} className="sx-link num" dir="ltr">{shipment.waybill}</Link></dd></div>
            {shipment.trackingCode && <div><dt>کد رهگیری</dt><dd dir="ltr">{shipment.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="sx-link">{shipment.trackingCode} ↗</a> : shipment.trackingCode}</dd></div>}
          </dl>
        </section>}
        {order.schedule && <section className="sx-my-card"><h2><StoreIcon name="calendar" size={17} />زمان ارسال</h2><p>{persianDay(order.schedule.date)}{order.schedule.slot && ` · ساعت ${order.schedule.slot}`}</p></section>}
        <section className="sx-my-card">
          <h2><StoreIcon name="receipt" size={17} />جمع سفارش</h2>
          <dl className="sx-my-kv">
            <div><dt>قیمت کالاها</dt><dd><Money amount={order.listTotal} currency={order.currency} /></dd></div>
            {order.listTotal > order.itemsTotal && <div className="is-save"><dt>تخفیف کالاها</dt><dd>−<Money amount={order.listTotal - order.itemsTotal} currency={order.currency} /></dd></div>}
            {order.discount > 0 && <div className="is-save"><dt>کد تخفیف {order.discountCode && <span dir="ltr">({order.discountCode})</span>}</dt><dd>−<Money amount={order.discount} currency={order.currency} /></dd></div>}
            <div><dt>هزینهٔ ارسال</dt><dd>{order.shipping > 0 ? <Money amount={order.shipping} currency={order.currency} /> : 'رایگان'}</dd></div>
            {order.walletApplied > 0 && <div><dt>پرداخت از کیف پول</dt><dd><Money amount={order.walletApplied} currency={order.currency} /></dd></div>}
            <div className="is-total"><dt>مبلغ نهایی</dt><dd><Money amount={order.total} currency={order.currency} /></dd></div>
          </dl>
        </section>
      </aside>
    </div>
    {order.state.key !== 'UNPAID' && <ReturnPanel orderId={order.id} />}
    {order.state.key !== 'UNPAID' && <RateSellers orderId={order.id} />}
    {order.events.length > 0 && <section className="sx-my-card">
      <h2><StoreIcon name="clock" size={17} />تاریخچهٔ سفارش</h2>
      <ol className="sx-timeline">{[...order.events].reverse().map((event) => <li key={event.id}>
        <b>{EVENT_LABEL[event.status] || (isFulfilmentStatus(event.status) ? FULFILMENT_LABEL[event.status] : event.status)}</b>
        <time>{persian(event.createdAt, true)}</time>
        {event.note && <p>{event.note}</p>}
      </li>)}</ol>
    </section>}
  </div>
}
