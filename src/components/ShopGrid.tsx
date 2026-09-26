'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import { fetchCheckoutGateways, fetchWalletBalances, money, startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import CheckoutError from '@/components/CheckoutError'
import Link from 'next/link'
import { ContentArt } from '@/components/content/ContentPrimitives'

export interface ShopProduct {
  id: number
  slug: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  price: number
  currency: string
  image: string
  stock: number
  featured: boolean
  categoryName: string
  categoryNameEn: string
  categorySlug: string
  kind: string
  hasVariants: boolean
  rating?: number
  ratingCount?: number
}

export interface ShopCategory {
  slug: string
  depth: number
  name: string
  nameEn: string
  parentId: number | null
  id: number
}

export default function ShopGrid({
  products,
  categories,
  initialCategory = '',
}: {
  products: ShopProduct[]
  categories: ShopCategory[]
  initialCategory?: string
}) {
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const router = useRouter()
  const { data: session } = useSession()
  const [activeCat, setActiveCat] = useState(initialCategory)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [buying, setBuying] = useState<number | null>(null)
  const [error, setError] = useState<{ code: string; message: string; needed: number; currency?: string } | null>(null)
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [gateways, setGateways] = useState<CheckoutGatewayChoice[]>([])
  const [gatewayByCurrency, setGatewayByCurrency] = useState<Record<string, string>>({})
  useEffect(() => { setActiveCat(initialCategory) }, [initialCategory])

  useEffect(() => {
    if (!session) {
      setBalances({})
      return
    }
    let alive = true
    fetchWalletBalances().then((items) => alive && setBalances(Object.fromEntries(items.map((x) => [x.currency, x.balance]))))
    return () => {
      alive = false
    }
  }, [session])

  useEffect(() => {
    let alive = true
    fetchCheckoutGateways().then((items) => alive && setGateways(items))
    return () => { alive = false }
  }, [])

  const visible = useMemo(() => {
    let list = products
    if (activeCat) {
      const allowed = new Set([activeCat])
      let changed = true
      while (changed) {
        changed = false
        for (const category of categories) if (category.parentId && allowed.has(categories.find(parent => parent.id === category.parentId)?.slug || '') && !allowed.has(category.slug)) { allowed.add(category.slug); changed = true }
      }
      list = list.filter((p) => allowed.has(p.categorySlug))
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((p) =>
        [p.name, p.nameEn, p.description, p.descriptionEn].join(' ').toLowerCase().includes(q)
      )
    }
    const sorted = [...list]
    if (sort === 'priceLow') sorted.sort((a, b) => a.price - b.price)
    else if (sort === 'priceHigh') sorted.sort((a, b) => b.price - a.price)
    else if (sort === 'featured') sorted.sort((a, b) => Number(b.featured) - Number(a.featured))
    else sorted.sort((a, b) => b.id - a.id)
    return sorted
  }, [products, activeCat, query, sort])

  function gatewaysFor(currency: string) {
    const code = String(currency || '').toUpperCase()
    return gateways.filter((g) => g.acceptedCurrencies.includes(code))
  }

  function selectedGatewayRef(currency: string) {
    const options = gatewaysFor(currency)
    const current = gatewayByCurrency[currency]
    return options.some((g) => g.ref === current) ? current : (options.find((g) => g.isDefault)?.ref || options[0]?.ref || '')
  }

  async function buy(productId: number, currency: string) {
    if (!session) {
      router.push('/login?next=/products')
      return
    }
    setError(null)
    setBuying(productId)
    const res = await startCheckout({ productId, gatewayRef: selectedGatewayRef(currency) || undefined })
    setBuying(null)
    if (res.ok) {
      setBalances((prev) => ({ ...prev, [res.currency]: res.balance }))
      if (res.paid || res.invoiceUrl) router.push(`/payment/result?invoice=${res.invoiceNumber}`)
      else if (res.paymentUrl) window.location.href = res.paymentUrl
      return
    }
    setError({ code: res.code, message: res.message, needed: res.needed })
  }

  const name = (p: ShopProduct) => (isFa ? p.name : p.nameEn || p.name)
  const desc = (p: ShopProduct) => (isFa ? p.description : p.descriptionEn || p.description)

  return (
    <>
      <div className="shop-toolbar">
        <div className="chip-row">
          <button className={`chip ${!activeCat ? 'chip-on' : ''}`} onClick={() => setActiveCat('')}>
            {t.allCategories}
          </button>
          {categories.map((c) => (
            <button key={c.slug} className={`chip ${activeCat === c.slug ? 'chip-on' : ''}`} onClick={() => setActiveCat(c.slug)}>
              {c.depth > 0 ? `${'· '.repeat(Math.min(c.depth, 4))}↳ ` : ''}{isFa ? c.name : c.nameEn || c.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="input imp-w-56"
            aria-label={t.searchProducts}
            type="search"
            placeholder={t.searchProducts}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="select imp-w-48" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t.sortBy}>
            <option value="newest">{t.newest}</option>
            <option value="featured">{t.featured}</option>
            <option value="priceLow">{t.priceLow}</option>
            <option value="priceHigh">{t.priceHigh}</option>
          </select>
        </div>
      </div>

      {session && Object.values(balances).some((v) => v > 0) && (
        <p className="muted text-sm mb-4 num">
          💳 {t.walletBalance}: <strong>{Object.entries(balances).filter(([,v]) => v > 0).map(([c,v]) => money(v, c, isFa ? 'fa-IR' : 'en-US')).join(' · ')}</strong>
        </p>
      )}

      <p className="shop-result-count" role="status">{visible.length.toLocaleString(isFa ? 'fa-IR' : 'en-US')} {isFa ? 'محصول' : 'products'}</p>
      <div className="shop-grid">
        {visible.map((p) => (
          <article key={p.id} className="shop-card">
            <div className="shop-media">
              <Link href={`/products/${p.slug}`} aria-label={name(p)}>{p.image ? <img src={p.image} alt={name(p)} loading="lazy" decoding="async" /> : <ContentArt kind="product" />}</Link>
              <div className="shop-media-badges">
                {p.featured && <span className="badge badge-purple">{t.featured}</span>}
                <span className="badge badge-gray">{p.kind === 'PHYSICAL' ? isFa ? 'فیزیکی' : 'Physical' : isFa ? 'مجازی' : 'Digital'}</span>
                <span className={`stock-pill ${p.stock === 0 ? 'stock-pill-out' : ''}`}>
                  {p.stock === 0 ? t.outOfStock : p.stock > 0 ? `${t.inStock} · ${p.stock}` : t.inStock}
                </span>
              </div>
            </div>
            <div className="shop-body">
              <div className="flex items-center justify-between gap-2">
                <h3 className="shop-title"><Link href={`/products/${p.slug}`}>{name(p)}</Link></h3>
                {p.categorySlug && <span className="badge badge-gray">{isFa ? p.categoryName : p.categoryNameEn || p.categoryName}</span>}
              </div>
              <p className="post-excerpt">{desc(p).slice(0, 110)}</p>
              <div className="shop-price-row">
                <span className="shop-price num">{money(p.price, p.currency, isFa ? 'fa-IR' : 'en-US')}</span>
                {(p.ratingCount || 0) > 0 && (
                  <span className="shop-rating" title={`${p.rating} / 5`}>
                    <span className="shop-rating-star" aria-hidden="true">★</span>
                    <strong className="num">{p.rating?.toFixed(1)}</strong>
                    <small className="num">({p.ratingCount})</small>
                  </span>
                )}
              </div>
              <div className="shop-card-actions">{gatewaysFor(p.currency).length>1&&<select className="select" aria-label={isFa?'درگاه پرداخت':'Payment gateway'} value={selectedGatewayRef(p.currency)} onChange={e=>setGatewayByCurrency(prev=>({...prev,[p.currency]:e.target.value}))}>{gatewaysFor(p.currency).map(g=><option key={g.ref} value={g.ref}>{g.label}</option>)}</select>}<Link href={`/products/${p.slug}`} className="btn btn-ghost">{isFa ? 'بررسی محصول' : 'View details'}</Link>
              {p.stock === 0 ? (
                <button className="btn btn-ghost mt-2" disabled>{t.outOfStock}</button>
              ) : p.kind === 'PHYSICAL' || p.hasVariants ? (
                <Link className="btn btn-primary mt-2" href={`/products/${p.slug}`}>{isFa ? 'انتخاب و خرید' : 'Choose & buy'}</Link>
              ) : (
                <button className="btn btn-primary mt-2" disabled={buying === p.id} onClick={() => buy(p.id,p.currency)}>
                  {buying === p.id ? '...' : t.buyNow}
                </button>
              )}
              </div>
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <div className="empty-state grid-column-span-3">
            <p className="muted">{t.noProducts}</p>
            {(query || activeCat) && <button className="btn btn-ghost mt-4" onClick={() => { setQuery(''); setActiveCat('') }}>{isFa ? 'پاک کردن فیلترها' : 'Clear filters'}</button>}
          </div>
        )}
      </div>

      {error && <CheckoutError code={error.code} message={error.message} needed={error.needed} currency={error.currency || 'USD'} />}
    </>
  )
}
