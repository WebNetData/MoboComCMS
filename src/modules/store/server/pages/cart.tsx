import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import SectionBarSlot from '@/components/site/SectionBarSlot'
import CartPage from '@/components/store/CartPage'
import CartCheckout from '@/components/store/CartCheckout'
import { ProductRail } from '@/components/store/Storefront'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { getViewer } from '@/modules/membership/server/membership'
import { CART_COOKIE, cartView } from '@/modules/store/server/cart'
import { getStoreSettings, productCards } from '@/modules/store/server/catalog'
import { deliverySchedule } from '@/modules/shipping/server/shipping'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'

const SHOP_CONTEXT = { route: 'shop' } as const

export const cartMetadata: Metadata = { title: 'سبد خرید', robots: { index: false, follow: false } }
export const checkoutMetadata: Metadata = { title: 'تکمیل سفارش', robots: { index: false, follow: false } }

async function owner() {
  const [viewer, jar] = await Promise.all([getViewer(), cookies()])
  return { userId: viewer.userId, token: jar.get(CART_COOKIE)?.value || null }
}

/** /cart — the shopping cart with suggestions under it. */
export async function CartView() {
  if (!await isStoreEnabled()) notFound()
  const [locale, theme, who] = await Promise.all([getServerLocale(), getServerTheme(), owner()])
  const [cart, settings, navPages] = await Promise.all([
    cartView(who),
    getStoreSettings(),
    db.page.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } }).catch(() => []),
  ])
  const inCart = cart.lines.map((line) => line.productId)
  const suggestions = await productCards({ id: { notIn: inCart }, stock: { not: 0 } }, [{ soldCount: 'desc' }, { id: 'desc' }], 12)
  return <>
    <ThemeHeader context={SHOP_CONTEXT} theme={theme} locale={locale} navPages={navPages} />
    <SectionBarSlot section="shop" />
    <main className="container sx-page sx-cart-page">
      <CartPage initial={cart} note={settings.cartNote} />
      <ProductRail title={cart.lines.length ? 'پیشنهاد برای خرید بعدی' : 'پرفروش‌ترین کالاها'} icon="star" products={suggestions} more="/products?sort=bestselling" />
    </main>
    <ThemeFooter context={SHOP_CONTEXT} locale={locale} navPages={navPages} />
  </>
}

/** /checkout/cart — address, delivery time and payment for the whole cart. */
export async function CartCheckoutView() {
  if (!await isStoreEnabled()) notFound()
  const who = await owner()
  if (!who.userId) redirect(`/login?next=${encodeURIComponent('/checkout/cart')}`)
  const cart = await cartView(who)
  if (!cart.lines.length || cart.blocked) redirect('/cart')
  const [schedule, gateways, theme] = await Promise.all([deliverySchedule(), checkoutGatewayOptions(cart.currency), getServerTheme()])
  return <>
    <SiteHeader theme={theme} />
    <main className="container content-surface sh-checkout-page">
      <CartCheckout cart={cart} delivery={{ enabled: schedule.settings.enabled, days: schedule.days }} gateways={gateways} />
    </main>
    <SiteFooter />
  </>
}
