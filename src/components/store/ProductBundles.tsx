'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { addBundleToCart } from '@/modules/store/ui/cart-client'
import type { ProductBundleCard } from '@/modules/store/server/bundles'
const COPY = {
  fa: { title: 'بسته‌های قابل خرید', total: 'مجموع بسته', member: 'مخصوص اعضای ویژه', unavailable: 'تعداد کامل بسته موجود نیست', adding: 'در حال افزودن…', add: 'افزودن بسته به سبد', loading: 'در حال دریافت بسته‌ها…', failed: 'دریافت بسته‌ها ناموفق بود.', retry: 'تلاش دوباره', success: 'همهٔ اجزای بسته به سبد اضافه شدند.', cart: 'مشاهدهٔ سبد', addFailed: 'افزودن کامل بسته انجام نشد؛ موجودی را بررسی کنید یا دوباره تلاش کنید.', hint: 'اجزا با هم به سبد اضافه می‌شوند؛ پس از آن مانند کالاهای عادی قابل ویرایش‌اند. قیمت مجموع کالاهاست و تخفیف جداگانه‌ای ندارد.' },
  en: { title: 'Purchasable bundles', total: 'Bundle total', member: 'VIP members only', unavailable: 'The complete bundle is unavailable', adding: 'Adding…', add: 'Add bundle to cart', loading: 'Loading bundles…', failed: 'Could not load bundles.', retry: 'Retry', success: 'All bundle components were added to your cart.', cart: 'View cart', addFailed: 'The complete bundle could not be added. Check availability or retry.', hint: 'Components enter the cart together and can then be edited as normal items. The total uses current item prices, with no separate bundle discount.' },
}

function BundleArticle({ item, fa, busy, add }: { item: ProductBundleCard; fa: boolean; busy: number | null; add: (item: ProductBundleCard) => void }) {
  const copy = fa ? COPY.fa : COPY.en
  const money = (amount: number) => formatCurrency(amount, item.currency, fa ? 'fa-IR' : 'en-US')
  return <article className="card mb-3" aria-label={fa ? item.name : item.nameEn || item.name}>
    <h3>{fa ? item.name : item.nameEn || item.name}</h3>
    <ul>{item.components.map(component => <li key={`${component.productId}:${component.variantId || 0}`}><Link href={`/products/${component.slug}`}>{fa ? component.name : component.nameEn || component.name}</Link> {component.variantName && <span>· {component.variantName}</span>} <span className="num">× {component.quantity.toLocaleString(fa ? 'fa-IR' : 'en-US')} — {money(component.total)}</span></li>)}</ul>
    <p><strong>{copy.total}: {money(item.total)}</strong></p>
    {!item.buyable && <p className="muted">{item.issue === 'MEMBERS_ONLY' ? copy.member : copy.unavailable}</p>}
    <button type="button" className="btn btn-primary" disabled={!item.buyable || busy !== null} onClick={() => add(item)}>{busy === item.id ? copy.adding : copy.add}</button>
  </article>
}

export default function ProductBundles({ slug }: { slug: string }) {
  const { locale } = useI18n(), { status } = useSession(), fa = locale === 'fa'
  const copy = fa ? COPY.fa : COPY.en
  const [items, setItems] = useState<ProductBundleCard[]>([]), [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState<number | null>(null), [notice, setMessage] = useState<{ error: boolean; text: string; context: string } | null>(null)
  const context = `${slug}:${status}`, message = notice?.context === context ? notice : null
  useEffect(() => {
    const controller = new AbortController(); setState('loading')
    fetch(`/api/products/${encodeURIComponent(slug)}/bundles`, { cache: 'no-store', signal: controller.signal }).then(async response => { if (response.status === 404) return { items: [] }; if (!response.ok) throw Error('bundles'); return response.json() }).then(data => { if (!controller.signal.aborted) { setItems(data.items || []); setState('ready') } }).catch(() => { if (!controller.signal.aborted) setState('error') })
    return () => controller.abort()
  }, [slug, status, attempt])
  async function add(item: ProductBundleCard) {
    if (busy !== null) return
    setBusy(item.id); setMessage(null)
    try {
      const result = await addBundleToCart(item.id)
      if (result.ok) setMessage({ error: false, context, text: copy.success })
      else { setMessage({ error: true, context, text: fa ? result.error : copy.addFailed }); setAttempt(value => value + 1) }
    } finally { setBusy(null) }
  }
  if (state === 'ready' && !items.length && !message) return null
  return <section className="store-tab-panel mb-6" aria-label={copy.title}>
    <header className="store-panel-head"><div><h2>{copy.title}</h2><p>{copy.hint}</p></div></header>
    {state === 'loading' && <p role="status" className="muted">{copy.loading}</p>}
    {state === 'error' && <div role="alert"><p>{copy.failed}</p><button type="button" className="btn btn-secondary" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button></div>}
    {message && <p role={message.error ? 'alert' : 'status'}>{message.text} {!message.error && <Link href="/cart">{copy.cart}</Link>}</p>}
    {state === 'ready' && items.map(item => <BundleArticle key={item.id} item={item} fa={fa} busy={busy} add={add} />)}
  </section>
}
