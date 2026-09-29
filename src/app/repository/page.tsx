import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'
import { moduleGuard } from '@/extensions/server/modules'
import { getVendorConfig, publicListing } from '@/modules/repository/server/vendor'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'افزونه‌ها و قالب‌ها', description: 'افزونه و قالب برای موبوکام؛ رایگان و پولی با لایسنس.' }

export default async function RepositoryPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  if (await moduleGuard('repository')) notFound()
  const config = await getVendorConfig()
  if (!config.enabled) notFound()
  const { kind, q } = await searchParams
  const items = await publicListing({ kind, q })
  return <><SiteHeader theme={await getServerTheme()} /><main className="rp-public" dir="rtl">
    <header><h1>{config.name || 'افزونه‌ها و قالب‌ها'}</h1><p className="muted">هر مورد با یک کلیک از پنل مدیریت سایت شما نصب می‌شود؛ نسخه‌ها امضاشده‌اند.</p></header>
    <form className="sa-filters" role="search"><select className="input" name="kind" defaultValue={kind || ''} aria-label="نوع"><option value="">همه</option><option value="PLUGIN">افزونه‌ها</option><option value="THEME">قالب‌ها</option></select><input className="input" type="search" name="q" defaultValue={q || ''} placeholder="جست‌وجو…" aria-label="جست‌وجو" /><button className="btn btn-primary">جست‌وجو</button></form>
    <div className="rp-grid">{items.map((p) => <article key={p.slug} className="rp-card">
      <header><b><Link href={`/repository/${p.slug}`}>{p.name}</Link></b><span className="sa-state">{p.kind === 'THEME' ? 'قالب' : 'افزونه'}</span></header>
      <p className="rp-sum">{p.summary}</p>
      <footer><b>{p.priceLabel}</b><span className="sa-sub" dir="ltr">v{p.version}</span></footer>
    </article>)}{!items.length && <p className="muted">موردی پیدا نشد.</p>}</div>
  </main><SiteFooter /></>
}
