import { createSectionSettingsHistory } from '@/modules/settings/server'
import { normalizePaySettings } from '@/modules/billing/domain/pay-policy'

export const paySettings = createSectionSettingsHistory(
  'billing.mobocom-pay.v1',
  'settings-mobocom-pay',
  normalizePaySettings,
  (value) => ({
    incomingEnabled: value.incomingEnabled,
    providerId: value.providerId,
    bankAccountIds: value.bankAccountIds,
    feeBps: value.feeBps,
  }),
)
export function bankFeedReady(providerId: string) {
  return Boolean(
    providerId &&
      process.env.MOBOCOM_PAY_BANK_PROVIDER === providerId &&
      (process.env.MOBOCOM_PAY_BANK_SECRET || '').length >= 32,
  )
}
