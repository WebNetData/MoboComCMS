import { notFound, redirect } from 'next/navigation'
import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { getServerTheme } from '@/i18n/server'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import PlanCheckout from '@/components/PlanCheckout'
import { checkoutGatewayOptions } from '@/modules/billing/server/gateways'
import { legacyNumber } from '@/shared/money'
import { getViewer } from '@/modules/membership/server/membership'

export default async function CheckoutPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ planId?: string; offerId?: string }> }) {
  const searchParams = await searchParamsPromise
  const offerId = Number(searchParams.offerId)
  const offer = Number.isSafeInteger(offerId) && offerId > 0 ? await db.serviceOffer.findFirst({ where: { id: offerId, ownerKey: 'SITE', active: true } }) : null
  if (searchParams.offerId && !offer) notFound()
  const id = offer?.planId || Number(searchParams.planId)
  if (!Number.isSafeInteger(id) || id <= 0) notFound()
  const plan = await db.plan.findUnique({ where: { id }, select: { id: true, name: true, nameEn: true, price: true, currency: true, days: true, trafficGB: true, active: true, access: true, memberPriceMinor: true } })
  if (!plan?.active) notFound()
  const [settings, gateways] = await Promise.all([getSettings(), checkoutGatewayOptions(plan.currency)])
  const viewer = await getViewer()
  // Members-only plans send everyone else to the VIP page; members see their price.
  if (plan.access === 'MEMBERS' && !viewer.opens) redirect('/vip')
  const memberPrice = !offer && viewer.member && plan.memberPriceMinor > 0n ? legacyNumber(plan.memberPriceMinor, plan.currency) : 0
  const base = { id: plan.id, name: plan.name, nameEn: plan.nameEn, currency: plan.currency, days: plan.days, trafficGB: plan.trafficGB, price: memberPrice && memberPrice < plan.price ? memberPrice : plan.price }
  const selected = offer ? { ...plan, name: offer.nameFa, nameEn: offer.nameEn, price: legacyNumber(offer.priceMinor, offer.currency), trafficGB: offer.trafficGB, days: offer.days } : base
  return <><SiteHeader theme={await getServerTheme()} /><main className="container content-surface"><PlanCheckout plan={selected} offerId={offer?.id} prefix={settings.subscriptionPrefix || 'happ'} gateways={gateways} /></main><SiteFooter /></>
}
