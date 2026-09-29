import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import BuyBox from '@/components/repository/BuyBox'
import { getServerTheme } from '@/i18n/server'
import { moduleGuard } from '@/extensions/server/modules'
import { getVendorConfig, publicProduct } from '@/modules/repository/server/vendor'

export const dynamic = 'force-dynamic'

async function load(slug: string) {
  if (await moduleGuard('repository')) return null
  if (!(await getVendorConfig()).enabled) return null
  const product = await publicProduct(slug)
  return product ? { product, id: product.id } : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await load((await params).slug)
  return found ? { title: found.product.name, description: found.product.summary || undefined } : {}
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await load((await params).slug)
  if (!found) notFound()
  const { product, id } = found
  return <><SiteHeader theme={await getServerTheme()} /><main className="rp-public" dir="rtl">
    <p><Link href="/repository" className="sa-link">← همهٔ افزونه‌ها و قالب‌ها</Link></p>
    <header><h1>{product.name}</h1><p className="muted">{product.summary}</p><p className="sa-sub">{product.kind === 'THEME' ? 'قالب' : 'افزونه'}{product.author ? ` · ${product.author}` : ''} · {product.downloads.toLocaleString('fa-IR')} دانلود</p></header>
    <BuyBox productId={id} name={product.name} priceLabel={product.priceLabel} free={product.price === '0'} />
    {product.description && <section><h2>معرفی</h2><div style={{ whiteSpace: 'pre-wrap', lineHeight: 2 }}>{product.description}</div></section>}
    <section><h2>نسخه‌ها</h2><ul className="upd-releases">{product.releases.map((r) => <li key={r.version}><b dir="ltr">{r.version}</b><span className="sa-sub">{new Date(r.publishedAt).toLocaleDateString('fa-IR')}{r.requiresCore ? ` · هسته ${r.requiresCore}` : ''}</span>{r.changelog && <span>{r.changelog}</span>}</li>)}</ul></section>
    <p className="sa-hint">هر لایسنس روی {product.siteLimit ? `${product.siteLimit.toLocaleString('fa-IR')} سایت` : 'تعداد نامحدود سایت'} فعال می‌شود و {product.supportDays ? `${product.supportDays.toLocaleString('fa-IR')} روز به‌روزرسانی` : 'به‌روزرسانی همیشگی'} دارد.</p>
  </main><SiteFooter /></>
}
