import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/platform/database/prisma'
import { getServerTheme } from '@/i18n/server'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import ProductCheckout from '@/components/store/ProductCheckout'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { getViewer } from '@/modules/membership/server/membership'
import { deliverySchedule } from '@/modules/shipping/server/shipping'
import { shippingFeeMinor } from '@/modules/shipping/domain/shipping'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'

export const metadata: Metadata = { title: 'تکمیل سفارش', robots: { index: false, follow: false } }

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ variant?: string }> }

/**
 * Last step for a physical product (Digikala style): pick one of the saved
 * addresses, a delivery day and time window, then pay. Digital products keep
 * the one-click buy on the product page.
 */
export default async function ProductCheckoutPage({ params, searchParams }: Props) {
  const [{ slug }, { variant: variantParam }] = await Promise.all([params, searchParams])
  if (!await isStoreEnabled()) notFound()
  const product = await db.product.findUnique({ where: { slug }, include: { variants: { where: { active: true }, orderBy: { id: 'asc' } } } })
  if (!product?.active) notFound()
  if (product.kind !== 'PHYSICAL') redirect(`/products/${product.slug}`)
  const variantId = Number(variantParam) || 0
  const variant = variantId ? product.variants.find((row) => row.id === variantId) || null : null
  if (product.variants.length && !variant) redirect(`/products/${product.slug}`)

  const viewer = await getViewer()
  const here = `/checkout/product/${product.slug}${variant ? `?variant=${variant.id}` : ''}`
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(here)}`)
  if (product.access === 'MEMBERS' && !viewer.member) redirect('/vip')

  const currency = normalizeCurrency(product.currency)
  const regularMinor = variant ? variant.priceMinor || toMinor(variant.price, currency) : product.priceMinor || toMinor(product.price, currency)
  const memberMinor = variant ? variant.memberPriceMinor : product.memberPriceMinor
  const itemMinor = viewer.member && memberMinor > 0n && memberMinor < regularMinor ? memberMinor : regularMinor
  const [schedule, gateways] = await Promise.all([deliverySchedule(), checkoutGatewayOptions(currency)])
  const shippingMinor = shippingFeeMinor(schedule.settings, currency, itemMinor)
  const inStock = product.stock !== 0 && (!variant || variant.stock !== 0)

  return <>
    <SiteHeader theme={await getServerTheme()} />
    <main className="container content-surface sh-checkout-page">
      <ProductCheckout
        item={{
          productId: product.id, slug: product.slug, name: product.name, image: product.image,
          variantId: variant?.id || null, variantName: variant?.name || '', inStock,
          currency, price: legacyNumber(itemMinor, currency), regularPrice: legacyNumber(regularMinor, currency), shipping: legacyNumber(shippingMinor, currency),
        }}
        delivery={{ enabled: schedule.settings.enabled, days: schedule.days }}
        gateways={gateways}
      />
    </main>
    <SiteFooter />
  </>
}
