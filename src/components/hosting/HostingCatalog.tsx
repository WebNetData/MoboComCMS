'use client'

import type { CheckoutSurface } from '@/modules/checkout/domain/surface'

import { useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import HostingOrder from '@/components/hosting/HostingOrder'
import type { CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { HOSTING_CYCLES, HOSTING_KINDS, HOURS_PER_MONTH, type PublicHostingProduct } from '@/modules/hosting/domain/catalog'

const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')
const ram = (mb: number) => (mb >= 1024 ? `${nf(mb / 1024)} گیگابایت` : `${nf(mb)} مگابایت`)

function specs(product: PublicHostingProduct): { icon: string; label: string; value: string }[] {
  const server = ['VPS', 'CLOUD_SERVER', 'DEDICATED'].includes(product.kind)
  const rows = server
    ? [
      product.cpuCores && { icon: 'cpu', label: 'پردازنده', value: `${nf(product.cpuCores)} هسته` },
      product.ramMb && { icon: 'layers', label: 'رم', value: ram(product.ramMb) },
      product.diskGb && { icon: 'database', label: 'دیسک', value: `${nf(product.diskGb)} گیگابایت ${product.diskType}` },
      { icon: 'activity', label: 'ترافیک', value: product.trafficGb ? `${nf(product.trafficGb)} گیگابایت` : 'نامحدود' },
      product.bandwidthMbps && { icon: 'bolt', label: 'پورت', value: product.bandwidthMbps >= 1000 ? `${nf(product.bandwidthMbps / 1000)} گیگابیت` : `${nf(product.bandwidthMbps)} مگابیت` },
      product.ipv4 && { icon: 'globe', label: 'آی‌پی', value: `${nf(product.ipv4)} عدد IPv4` },
    ]
    : [
      product.diskGb && { icon: 'database', label: 'فضا', value: `${nf(product.diskGb)} گیگابایت ${product.diskType}` },
      { icon: 'activity', label: 'ترافیک', value: product.trafficGb ? `${nf(product.trafficGb)} گیگابایت` : 'نامحدود' },
      { icon: 'globe', label: 'سایت', value: product.sites ? `${nf(product.sites)} دامنه` : 'نامحدود' },
      product.mailboxes && { icon: 'mail', label: 'ایمیل', value: `${nf(product.mailboxes)} صندوق` },
      product.databases && { icon: 'layers', label: 'پایگاه داده', value: `${nf(product.databases)} عدد` },
    ]
  return rows.filter(Boolean) as { icon: string; label: string; value: string }[]
}

/**
 * The public catalogue of one page: kind tabs, a billing-cycle switch that shows the saving, plan cards, and for
 * hourly cloud an estimate for the hours a customer expects to use.
 */
export default function HostingCatalog({ products, gateways, signedIn, minHours, surface = 'public' }: { surface?: CheckoutSurface; products: PublicHostingProduct[]; gateways: CheckoutGatewayChoice[]; signedIn: boolean; minHours: number }) {
  const [ordering, setOrdering] = useState<PublicHostingProduct | null>(null)
  const kinds = useMemo(() => HOSTING_KINDS.filter((kind) => products.some((product) => product.kind === kind.id)), [products])
  const [kind, setKind] = useState<string>(kinds[0]?.id || '')
  const shown = products.filter((product) => product.kind === kind)
  const cycles = HOSTING_CYCLES.filter((cycle) => shown.some((product) => product.prices.some((price) => price.cycle === cycle.id)))
  const [picked, setPicked] = useState<string>('MONTH')
  const cycle = cycles.find((item) => item.id === picked) || cycles.find((item) => item.id === 'MONTH') || cycles[0]
  const [hours, setHours] = useState(HOURS_PER_MONTH)
  const bestSaving = (id: string) => Math.max(0, ...shown.map((product) => product.prices.find((price) => price.cycle === id)?.saving || 0))

  if (!products.length) return <div className="hx-soon">
    <span className="hx-soon-mark" aria-hidden="true"><Icon name="server" size={28} /></span>
    <h2>پلن‌ها به‌زودی منتشر می‌شوند</h2>
    <p>در حال آماده‌سازی سرورها هستیم. برای مشاوره و سفارش اختصاصی پیام بدهید.</p>
    <Link className="btn btn-primary" href="/dashboard/tickets">گفت‌وگو با کارشناس</Link>
  </div>

  return <div className="hx-catalog">
    <div className="hx-controls">
      {kinds.length > 1 && <div className="hx-tabs" role="tablist" aria-label="نوع سرویس">
        {kinds.map((item) => <button key={item.id} type="button" role="tab" aria-selected={kind === item.id} className={kind === item.id ? 'is-on' : ''} onClick={() => setKind(item.id)}>{item.label}</button>)}
      </div>}
      {cycles.length > 1 && <div className="hx-cycles" role="radiogroup" aria-label="دورهٔ پرداخت">
        {cycles.map((item) => {
          const saving = bestSaving(item.id)
          return <button key={item.id} type="button" role="radio" aria-checked={cycle?.id === item.id} className={cycle?.id === item.id ? 'is-on' : ''} onClick={() => setPicked(item.id)}>
            {item.label}{saving > 0 && <span className="hx-badge">تا {nf(saving)}٪ ارزان‌تر</span>}
          </button>
        })}
      </div>}
    </div>

    {cycle?.id === 'HOURLY' && <div className="hx-estimator">
      <label htmlFor="hx-hours"><Icon name="clock" size={18} /> چند ساعت در ماه روشن است؟ <b className="num">{nf(hours)} ساعت</b></label>
      <input id="hx-hours" type="range" min={1} max={HOURS_PER_MONTH} step={1} value={hours} onChange={(event) => setHours(Number(event.target.value))} />
      <p>هزینه فقط برای ساعت‌هایی که سرویس دارید از کیف پول کم می‌شود؛ هر وقت حذفش کنید، هزینه متوقف می‌شود.</p>
    </div>}

    <div className="hx-grid" key={`${kind}-${cycle?.id}`}>
      {shown.map((product, index) => {
        const price = product.prices.find((item) => item.cycle === cycle?.id)
        return <article key={product.id} className={`hx-plan${product.featured ? ' is-featured' : ''}${price ? '' : ' is-muted'}`} style={{ ['--i' as string]: index }}>
          {product.featured && <span className="hx-ribbon">پیشنهاد ما</span>}
          <header>
            <span className="hx-plan-kind">{product.kindLabel}</span>
            <h3>{product.name}</h3>
            {product.tagline && <p>{product.tagline}</p>}
          </header>
          <div className="hx-price" aria-live="polite">
            {price ? <>
              <b className="num">{nf(cycle?.id === 'HOURLY' ? price.amount * hours : price.amount)}</b>
              <span>تومان {cycle?.id === 'HOURLY' ? `برای ${nf(hours)} ساعت` : `/ ${cycle?.short}`}</span>
              {cycle?.id === 'HOURLY'
                ? <small>ساعتی {nf(price.amount)} تومان</small>
                : cycle && cycle.months > 1 && <small>ماهانه {nf(price.monthly)} تومان{price.saving > 0 && <em> · {nf(price.saving)}٪ صرفه‌جویی</em>}</small>}
              {price.setup > 0 && <small>راه‌اندازی یک‌باره {nf(price.setup)} تومان</small>}
            </> : <span className="hx-na">در این دوره ارائه نمی‌شود</span>}
          </div>
          <ul className="hx-specs">{specs(product).map((row) => <li key={row.label}><Icon name={row.icon} size={16} /><span>{row.label}</span><b>{row.value}</b></li>)}</ul>
          {product.features.length > 0 && <ul className="hx-features">{product.features.map((feature) => <li key={feature}><Icon name="check" size={14} />{feature}</li>)}</ul>}
          {product.location && <p className="hx-location"><Icon name="pin" size={14} /> {product.location}</p>}
          <div className="hx-plan-cta">
            <button type="button" className="btn btn-primary" onClick={() => setOrdering(product)}>{cycle?.id === 'HOURLY' ? 'ساخت سرویس ساعتی' : 'سفارش'}</button>
            <Link className="btn btn-ghost" href="/dashboard/tickets">مشاوره</Link>
          </div>
        </article>
      })}
    </div>
    {ordering && <HostingOrder surface={surface} product={ordering} cycle={cycle?.id || 'MONTH'} gateways={gateways} signedIn={signedIn} minHours={minHours} onClose={() => setOrdering(null)} />}
  </div>
}
