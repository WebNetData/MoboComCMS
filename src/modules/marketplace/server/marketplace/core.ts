import { cache } from 'react'
import { isModuleEnabled } from '@/extensions/server/modules'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { normalizeMarketplaceSettings, type MarketplaceSettings } from '@/modules/marketplace/domain/marketplace'

/**
 * Multi-vendor marketplace: sellers apply and run their own shop (products,
 * stock, their order lines), earn sales minus commission into a ledger with a
 * returns hold, withdraw to their IBAN, and get rated by buyers. The site
 * itself stays the merchant of record: customers pay the site, the site pays
 * sellers.
 */

const KEY = 'store.marketplace.v1'

export const DAY = 86_400_000

export const marketplaceEnabled = cache(() => isModuleEnabled('marketplace'))

export async function getMarketplaceSettings(): Promise<MarketplaceSettings & { sellerShipsDirectly: boolean }> {
  const raw = (await readJsonSetting(KEY)) as Record<string, unknown> | null
  return { ...normalizeMarketplaceSettings(raw), sellerShipsDirectly: raw?.sellerShipsDirectly === true }
}

export async function saveMarketplaceSettings(input: unknown) {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const next = { ...normalizeMarketplaceSettings(raw), sellerShipsDirectly: raw.sellerShipsDirectly === true }
  await writeJsonSetting(KEY, next)
  return next
}
