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
import { orderFileProducts } from '@/modules/store/server/product-files'
import ProductDownloads from '@/components/store/ProductDownloads'
import CopyText from '@/components/software/CopyText'
import DeliveredDetails from '@/components/store/DeliveredDetails'
import { buyerDelivery, type BuyerDelivery } from '@/modules/store/server/staff-delivery'
import { buyerDeliveryFiles } from '@/modules/store/server/delivery-files'

const fa = (value: number) => value.toLocaleString('fa-IR')
/** «۳ ساعت پیش» from a moment, at the largest unit that is at least one. */
const relative = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' })
const ago = (from: Date, now = Date.now()) => {
  const minutes = Math.max(1, Math.round((now - from.getTime()) / 60_000)), format = relative
  return minutes < 60 ? format.format(-minutes, 'minute') : minutes < 48 * 60 ? format.format(-Math.round(minutes / 60), 'hour') : format.format(-Math.round(minutes / 1440), 'day')
}

/**
 * A virtual order in a specialist's hands (owner 2026-11-12): where it is — paid, taken, delivered — and when the shop
 * says it usually arrives. Past that time the buyer is told the team knows (the worker has flagged it to them).
 */
function HandoffCard({ delivery }: { delivery: BuyerDelivery }) {
  const steps = [{ label: 'پرداخت شد', done: true }, { label: delivery.assigned ? 'کارشناس سفارش را برداشته' : 'در صف کارشناس', done: delivery.assigned }, { label: 'تحویل', done: false }]
  const current = steps.findIndex((step) => !step.done)
  const late = delivery.hours > 0 && Date.now() - delivery.paidAt.getTime() > delivery.hours * 3_600_000
  return <section className="sx-my-card sx-handoff" aria-label="وضعیت آماده‌سازی سفارش">
    <div className="sx-handoff-head">
      <span className="sx-handoff-icon" aria-hidden="true"><StoreIcon name="clock" size={18} /></span>
      <div>
        <h2>{delivery.assigned ? 'کارشناس در حال آماده‌سازی سفارش شماست' : 'سفارش شما به کارشناس سپرده شد'}</h2>
        <p>{late ? 'آماده‌سازی کمی بیشتر از معمول طول کشیده و کارشناس در جریان است؛ به محض تحویل خبرتان می‌کنیم.' : delivery.hours > 0 ? `معمولاً تا ${fa(delivery.hours)} ساعت پس از پرداخت تحویل می‌شود؛ به محض آماده شدن خبرتان می‌کنیم.` : 'به محض آماده شدن، اطلاعات همین‌جا نشان داده می‌شود و خبرتان می‌کنیم.'}</p>
      </div>
    </div>
    <ol className="sx-handoff-steps">{steps.map((step, index) => <li key={step.label} className={step.done ? 'is-done' : index === current ? 'is-current' : ''} aria-current={index === current ? 'step' : undefined}>
      <span className="sx-handoff-dot" aria-hidden="true">{step.done ? <StoreIcon name="check" size={12} /> : null}</span>{step.label}
    </li>)}</ol>
    <small className="sx-handoff-time">پرداخت: {ago(delivery.paidAt)}</small>
  </section>
}
const persian = (value: Date | string, time = false) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Tehran' }).format(new Date(value))
const persianDay = (day: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
const EVENT_LABEL: Record<string, string> = {
  PAID: 'پرداخت شد', NOTE: 'پیام فروشگاه', ...FULFILMENT_LABEL, PENDING: 'ثبت سفارش',
  CANCEL_REQUESTED: 'درخواست لغو', RETURN_REQUESTED: 'درخواست مرجوعی', RETURN_APPROVED: 'مرجوعی تأیید شد', RETURN_REJECTED: 'درخواست رد شد',
  RETURN_WITHDRAWN: 'درخواست لغو شد', REFUNDED: 'برگشت وجه به کیف پول',
}

const SERVICE_STATE: Record<string, [string, string]> = { PAID: ['پرداخت‌شده', 'is-ok'], PENDING: ['در انتظار پرداخت', 'is-warn'], CANCELLED: ['لغوشده', ''], FAILED: ['ناموفق', 'is-bad'] }

async function userId(next: string) {
  const viewer = await getViewer()
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(next)}`)
  return viewer.userId
}

type ServiceOrder = Awaited<ReturnType<typeof customerServiceOrders>>[number]
const serviceRow = (row: ServiceOrder) => {
  const state = SERVICE_STATE[row.status] || SERVICE_STATE.FAILED
  return <li key={row.id} className="sx-svc">
    <span className="sx-svc-icon" aria-hidden="true"><StoreIcon name="receipt" size={18} /></span>
    <div className="sx-svc-main"><b>{row.title}</b>{row.detail && <small className="sx-svc-detail">{row.detail}</small>}<small className="num">کد {fa(row.id)} · {persian(row.createdAt)}</small></div>
    <div className="sx-svc-end"><Money amount={row.total} currency={row.currency} /><span className={`sx-svc-state ${state[1]}`}>{state[0]}</span>{row.invoiceNumber && <Link href={`/invoice/${row.invoiceNumber}`} className="sx-link">{row.status === 'PENDING' ? 'پرداخت' : 'فاکتور'}</Link>}</div>
  </li>
}

/** Where a paid order is on its way, as five short segments with the reached ones filled. The status pill beside it says it in words. */
const progress = (key: string) => {
  if (key === 'UNPAID' || key === 'CANCELLED' || key === 'RETURNED' || !isFulfilmentStatus(key)) return null
  const reached = key === 'DELIVERED' ? TRACKING_STEPS.length : trackingIndex(key) + 1
  return <span className="sx-my-meter" aria-hidden="true">{TRACKING_STEPS.map((step, index) => <i key={step.status} className={index < reached ? 'is-on' : undefined} />)}</span>
}

/** /dashboard/orders — Digikala-style order history with status tabs. */
export async function MyOrdersView({ tab: tabParam, base = '/dashboard/orders' }: { tab?: string; base?: '/dashboard/orders' | '/miniapp/orders' }) {
  const id = await userId(base)
  const tab = (CUSTOMER_TABS.some((item) => item.key === tabParam) ? tabParam : 'current') as CustomerTab
  const [{ orders, counts }, services] = await Promise.all([customerOrders(id, tab), customerServiceOrders(id)])
  return <div className="sx-my" dir="rtl">
    <header className="sx-my-head"><h1>سفارش‌های من</h1><Link href="/products" className="sx-link">ادامهٔ خرید<StoreIcon name="chevron" size={15} /></Link></header>
    <nav className="sx-my-tabs" aria-label="وضعیت سفارش‌ها">{CUSTOMER_TABS.map((item) => <Link key={item.key} href={`${base}?tab=${item.key}`} className={item.key === tab ? 'is-active' : ''} aria-current={item.key === tab ? 'page' : undefined}>
      {item.label}{counts[item.key] > 0 && <span className="num">{fa(counts[item.key])}</span>}
    </Link>)}</nav>
    {orders.length === 0 ? <div className={`sx-empty${services.length ? ' is-small' : ''}`}><StoreIcon name="receipt" size={services.length ? 28 : 40} /><b>سفارش فروشگاهی در این بخش ندارید</b><Link href="/products" className="sx-btn">رفتن به فروشگاه</Link></div>
      : <ul className="sx-my-list">{orders.map((order) => <li key={order.id}>
        <Link href={`${base}/${order.id}`} className="sx-my-order">
          <div className="sx-my-order-top">
            <b className="sx-my-order-title">{order.lines[0]?.name || `سفارش ${fa(order.id)}`}{order.lines.length > 1 && <small> و {fa(order.lines.length - 1)} کالای دیگر</small>}</b>
            <span className={`sx-state is-${order.state.tone}`}>{order.state.label}</span>
            <StoreIcon name="chevron" size={18} />
          </div>
          {progress(order.state.key)}
          <dl className="sx-my-order-meta">
            <div><dt>تاریخ</dt><dd>{persian(order.createdAt)}</dd></div>
            <div><dt>کد سفارش</dt><dd className="num">{fa(order.id)}</dd></div>
            <div><dt>مبلغ</dt><dd><Money amount={order.total} currency={order.currency} /></dd></div>
          </dl>
          <ul className="sx-my-thumbs" aria-label="کالاها">{order.lines.slice(0, 6).map((line, index) => <li key={index} title={line.name}>{line.image ? <img src={line.image} alt={line.name} loading="lazy" /> : <StoreIcon name="box" size={22} />}{line.quantity > 1 && <span className="num">{fa(line.quantity)}</span>}</li>)}{order.lines.length > 6 && <li className="is-more num">+{fa(order.lines.length - 6)}</li>}</ul>
        </Link>
      </li>)}</ul>}
    {services.length > 0 && <section className="sx-my-services">
      <header><h2>خدمات، درخواست‌ها و اشتراک‌ها</h2><p>سفارش‌هایی که کالای فروشگاه نیستند: پرداخت سایت خارجی، فرم‌های پولی، اشتراک ویژه و پلن‌ها.</p></header>
      <ul className="sx-svc-list">{services.slice(0, 10).map(serviceRow)}</ul>
      {services.length > 10 && <details className="sx-svc-rest"><summary>نمایش {fa(services.length - 10)} سفارش دیگر</summary><ul className="sx-svc-list">{services.slice(10).map(serviceRow)}</ul></details>}
    </section>}
  </div>
}

/** /dashboard/orders/:id — tracking stepper, items, address, delivery time and totals. */
export async function MyOrderView({ id: idParam, base = '/dashboard/orders' }: { id: string; base?: '/dashboard/orders' | '/miniapp/orders' }) {
  const id = Number(idParam)
  const user = await userId(`${base}/${idParam}`)
  const order = Number.isSafeInteger(id) && id > 0 ? await customerOrder(user, id) : null
  if (!order) notFound()
  const shipment = await orderShipment(order.id).catch(() => null)
  // Codes delivered by the product's own pool are the buyer's as soon as the order is paid; a specialist's hand
  // delivery shows its progress while open and its details once delivered.
  const [codes, handoff, handedFiles] = await Promise.all([buyerCodes(user, order.id).catch(() => []), buyerDelivery(user, order.id).catch(() => null), buyerDeliveryFiles(user, order.id).catch(() => [])])
  // Older deliveries of code orders repeat the codes as text: the codes card above already shows them.
  const delivered = handoff?.details && (handoff.details.structured || !codes.length) && (handoff.details.items.length || handoff.details.note) ? handoff.details : handedFiles.length ? { items: [], note: '' } : null
  const fileProducts = await orderFileProducts(user, order.id)
  const closed = order.fulfilment === 'CANCELLED' || order.fulfilment === 'RETURNED' || order.state.key === 'CANCELLED'
  const step = order.state.key === 'UNPAID' ? -1 : order.fulfilment === 'DELIVERED' ? TRACKING_STEPS.length : trackingIndex(order.fulfilment || 'PENDING')
  return <div className="sx-my sx-my-detail" dir="rtl">
    <header className="sx-my-head">
      <div><Link href={base} className="sx-link"><StoreIcon name="chevron" size={15} />سفارش‌ها</Link><h1>جزئیات سفارش <span className="num">{fa(order.id)}</span></h1></div>
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
    {handoff && !closed && handoff.status !== 'DELIVERED' && !codes.length && <HandoffCard delivery={handoff} />}
    {delivered && <section className="sx-my-card sx-delivered" aria-label="اطلاعات تحویل">
      <h2><StoreIcon name="shield" size={17} />اطلاعات تحویل{handoff?.deliveredAt && <small>تحویل {persian(handoff.deliveredAt, true)}</small>}</h2>
      {handoff?.note && <p className="sx-dlv-hint">{handoff.note}</p>}
      <DeliveredDetails orderId={order.id} items={delivered.items} note={delivered.note} files={handedFiles} />
    </section>}
    {codes.length > 0 && <section className="sx-my-card sx-my-codes" aria-label="کدهای خریداری‌شده">
      <h2><StoreIcon name="bolt" size={17} />کدهای شما</h2>
      <p className="sx-my-codes-note">این کدها فقط به شما نشان داده می‌شوند؛ آن‌ها را در اختیار دیگران نگذارید.</p>
      {codes.map((line, index) => <div key={index} className="sx-my-code-line">
        <b>{line.name}{line.variantName && <small> · {line.variantName}</small>}</b>
        <ul>{line.codes.map((code) => <li key={code}><CopyText value={code} label="کد" /></li>)}</ul>
      </div>)}
    </section>}
    {fileProducts.map(({ product, access }) => access && <ProductDownloads key={product.id} access={access} slug={product.slug} title={product.name} anchor={`downloads-${product.id}`} />)}
    <div className="sx-my-grid">
      <section className="sx-my-card">
        <h2>کالاها <small className="num">({fa(order.lines.reduce((sum, line) => sum + line.quantity, 0))})</small></h2>
        <ul className="sx-my-lines">{order.lines.map((line, index) => <li key={index}>
          {line.image ? <img src={line.image} alt="" loading="lazy" /> : <span className="sx-my-ph"><StoreIcon name="box" size={24} /></span>}
          <div>{line.slug ? <Link href={`/products/${line.slug}`}>{line.name}</Link> : <b>{line.name}</b>}{line.variantName && <small>{line.variantName}</small>}<small className="num">{fa(line.quantity)} عدد × <Money amount={line.unitPrice} currency={order.currency} /></small></div>
          <Money amount={line.total} currency={order.currency} />
          {(line.openAmount || line.inputs.length > 0 || line.inputsErasedAt) && <div className="sx-my-given">
            {line.openAmount && <p>مبلغ پرداخت در سایت مقصد: <b className="num" dir="ltr">{line.openAmount.amount} {line.openAmount.currency}</b></p>}
            {line.inputs.length > 0 && <dl>{line.inputs.map((answer) => <div key={answer.key}><dt>{answer.label}</dt><dd dir="auto">{answer.value}</dd></div>)}</dl>}
            {line.inputs.length > 0 && <small>اطلاعاتی که برای انجام این سفارش دادید. رمزها نمایش داده نمی‌شوند و پس از پایان سفارش همه پاک می‌شود.</small>}
            {!line.inputs.length && line.inputsErasedAt && <small>اطلاعاتی که برای این سفارش داده بودید پاک شده است.</small>}
          </div>}
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
