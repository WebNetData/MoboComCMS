import Link from '@/components/AppLink'
import { publicHostingCatalog } from '@/modules/hosting/server/catalog'
import { formatAmount } from '@/shared/money/format'
import { minorToDecimal, normalizeCurrency } from '@/shared/money'
import { HOSTING_CYCLES } from '@/modules/hosting/domain/catalog'

/** Public catalogue only; ordering, service state and credentials stay with Hosting. */
export default async function BuilderHosting({ group, title, locale }: { group: string; title: string; locale: string }) {
  const groups = group === 'hosting' || group === 'servers' ? [group] as const : ['hosting', 'servers'] as const
  const products = (await Promise.all(groups.map(g => publicHostingCatalog(g)))).flat().slice(0, 8), fa = locale === 'fa'
  return <section aria-label={title || (fa ? 'پلن‌های میزبانی' : 'Hosting plans')}>
    {title && <h2>{title}</h2>}
    {!products.length ? <p>{fa ? 'هنوز پلنی برای نمایش منتشر نشده است.' : 'No plans are available yet.'}</p> : <div className="hp-plan-grid">{products.map(p => {
      const price = p.prices[0], href = ['SHARED', 'RESELLER', 'CLOUD_HOSTING'].includes(p.kind) ? '/hosting' : '/servers'
      return <article className="hp-plan" key={p.id}><span>{p.kindLabel}</span><h3>{p.name}</h3><p>{p.tagline}</p><dl>{[[fa ? 'پردازنده' : 'CPU', p.cpuCores], [fa ? 'حافظه (MB)' : 'RAM (MB)', p.ramMb], [fa ? 'دیسک (GB)' : 'Disk (GB)', p.diskGb]].filter(([, value]) => Number(value) > 0).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString(locale)}</dd></div>)}</dl><p><strong>{formatAmount(Number(minorToDecimal(BigInt(price.amount), normalizeCurrency(p.currency))), p.currency, locale)}</strong> · {HOSTING_CYCLES.find(c => c.id === price.cycle)?.label || ''}</p><Link className="btn btn-primary" href={href}>{fa ? 'بررسی پلن و سفارش' : 'Review plans and order'}</Link></article>
    })}</div>}
  </section>
}
