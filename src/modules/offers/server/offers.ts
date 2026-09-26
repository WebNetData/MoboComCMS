import { db } from '@/platform/database/prisma'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'
import { resellerWholesaleMinor } from '@/modules/reseller/server/reseller'

export const resellerOwnerKey = (resellerId: number) => `RESELLER:${resellerId}`

export async function getPublicOffers() {
  return db.serviceOffer.findMany({ where: { ownerKey: 'SITE', active: true, plan: { active: true, panel: { active: true } } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
}

export async function validateOffer(input: any, ownerKey: string) {
  const planId = Number(input?.planId)
  const trafficGB = Number(input?.trafficGB)
  const days = Number(input?.days)
  const deviceLimit = Number(input?.deviceLimit)
  const nameFa = String(input?.nameFa || '').trim()
  const nameEn = String(input?.nameEn || '').trim()
  const sortOrder = Number(input?.sortOrder || 0)
  if (![planId, trafficGB, days, deviceLimit, sortOrder].every(Number.isSafeInteger) || planId <= 0 || trafficGB < 0 || trafficGB > 100000 || days < 1 || days > 3650 || deviceLimit < 1 || deviceLimit > 100 || Math.abs(sortOrder) > 100000 || !nameFa || !nameEn || nameFa.length > 100 || nameEn.length > 100) throw Error('invalid offer')
  const plan = await db.plan.findUnique({ where: { id: planId }, include: { panel: true } })
  if (!plan?.active || !plan.panel?.active) throw Error('active plan and panel required')
  if (plan.days > 0 && days > plan.days || plan.deviceLimit > 0 && deviceLimit > plan.deviceLimit) throw Error('offer exceeds plan limits')
  const currency = normalizeCurrency(plan.currency)
  const priceMinor = toMinor(input?.price, currency)
  if (priceMinor <= 0n || priceMinor > 9_000_000_000_000n) throw Error('price is outside the supported range')
  let cardPriceMinor: bigint | null = null
  let cardCurrency: string | null = null
  if (ownerKey === 'SITE') {
    if (plan.trafficGB > 0 && (trafficGB === 0 || trafficGB > plan.trafficGB)) throw Error('offer exceeds plan traffic')
  } else {
    if (input?.cardPrice !== '' && input?.cardPrice != null) {
      cardCurrency = normalizeCurrency(input?.cardCurrency || currency)
      cardPriceMinor = toMinor(input.cardPrice, cardCurrency)
      if (cardPriceMinor <= 0n || cardPriceMinor > 9_000_000_000_000n) throw Error('card transfer amount is outside the supported range')
    }
    const resellerId = Number(ownerKey.slice('RESELLER:'.length))
    const reseller = await db.reseller.findUnique({ where: { id: resellerId }, include: { prices: true } })
    if (!reseller?.active) throw Error('reseller inactive')
    if (trafficGB === 0 && (plan.trafficGB !== 0 || !reseller.allowUnlimitedTraffic || reseller.trafficQuotaGB > 0)) throw Error('unlimited traffic is unavailable')
    if (reseller.maxTrafficPerAccountGB > 0 && (trafficGB === 0 || trafficGB > reseller.maxTrafficPerAccountGB)) throw Error('offer exceeds reseller traffic limit')
    if (reseller.maxDaysPerAccount > 0 && days > reseller.maxDaysPerAccount || reseller.maxDevicesPerAccount > 0 && deviceLimit > reseller.maxDevicesPerAccount) throw Error('offer exceeds reseller contract')
    const wholesale = resellerWholesaleMinor(reseller, plan, trafficGB)
    if (priceMinor < wholesale) throw Error(`retail price must cover wholesale cost (${legacyNumber(wholesale, currency)} ${currency})`)
  }
  return { ownerKey, planId, nameFa, nameEn, trafficGB, days, deviceLimit, priceMinor, currency, cardPriceMinor, cardCurrency, active: input?.active !== false, sortOrder }
}

export function presentOffer(offer: { priceMinor: bigint; currency: string; cardPriceMinor: bigint | null; cardCurrency: string | null } & Record<string, unknown>) {
  return { ...offer, priceMinor: undefined, cardPriceMinor: undefined, price: legacyNumber(offer.priceMinor, offer.currency), cardPrice: offer.cardPriceMinor == null ? '' : legacyNumber(offer.cardPriceMinor, offer.cardCurrency || offer.currency) }
}
