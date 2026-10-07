import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { normalizeGift, normalizeLoyalty, normalizeRecovery } from '@/modules/store/domain/marketing'

// Store marketing: "let me know when it's back", abandoned cart reminders,
// gift cards and the customer club. The background jobs (runStockAlerts,
// runCartRecovery, runLoyaltyAwards) run every minute from the job scheduler.

const LOYALTY_KEY = 'store.loyalty.v1'

const RECOVERY_KEY = 'store.cartRecovery.v1'

const GIFT_KEY = 'store.giftCards.v1'

export const GIFT_CURRENCY = 'IRT'

export const getLoyaltySettings = async () => normalizeLoyalty(await readJsonSetting(LOYALTY_KEY))

export const getRecoverySettings = async () => normalizeRecovery(await readJsonSetting(RECOVERY_KEY))

export const getGiftSettings = async () => normalizeGift(await readJsonSetting(GIFT_KEY))

export async function saveLoyaltySettings(input: unknown) {
  const previous = await getLoyaltySettings()
  const next = normalizeLoyalty(input)
  // Earning starts when the club is first switched on: older orders never earn.
  next.since = previous.since || (next.enabled ? new Date().toISOString() : '')
  await writeJsonSetting(LOYALTY_KEY, next)
  return next
}

export async function saveRecoverySettings(input: unknown) { const next = normalizeRecovery(input); await writeJsonSetting(RECOVERY_KEY, next); return next }

export async function saveGiftSettings(input: unknown) { const next = normalizeGift(input); await writeJsonSetting(GIFT_KEY, next); return next }

export const positive = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0 }

export const notify = (event: Parameters<typeof createInboxEvent>[0]) => createInboxEvent(event).catch((error) => logEvent('warn', 'store.marketing_notify_failed', { kind: event.kind, error: String(error) }))
