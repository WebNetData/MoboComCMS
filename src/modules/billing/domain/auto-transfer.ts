import { PayError } from './pay'
export type AutoTransferSource = 'SMS' | 'BALE'
export const transferDisplayDefaults = () => ({ cardNumber: true, bankName: false, holderName: false, accountNumber: false, iban: false })
export type TransferDisplay = ReturnType<typeof transferDisplayDefaults>
export function transferDisplay(input: unknown): TransferDisplay {
  const defaults = transferDisplayDefaults()
  if (input === undefined) return defaults
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PayError('اطلاعات قابل نمایش معتبر نیست')
  const raw = input as Record<string, unknown>
  if (Object.keys(raw).some(key => !Object.hasOwn(defaults, key) || typeof raw[key] !== 'boolean')) throw new PayError('اطلاعات قابل نمایش معتبر نیست')
  const result = { ...defaults, ...raw } as TransferDisplay
  if (!result.cardNumber && !result.accountNumber && !result.iban) throw new PayError('حداقل شماره کارت، شماره حساب یا شبا را برای نمایش انتخاب کنید')
  return result
}
export type AutoTransferConfig = { autoVerify: boolean; autoSources: AutoTransferSource[]; autoBankAccountId: number | null; autoDisplay: TransferDisplay }
export function autoTransferConfig(input: unknown): AutoTransferConfig {
  let value: unknown = input
  if (typeof input === 'string') { try { value = JSON.parse(input || '{}') } catch { throw new PayError('تنظیمات تأیید خودکار معتبر نیست') } }
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const autoVerify = raw.autoVerify === undefined ? false : raw.autoVerify
  if (typeof autoVerify !== 'boolean') throw new PayError('وضعیت تأیید خودکار معتبر نیست')
  const sources = raw.autoSources === undefined ? ['SMS', 'BALE'] : raw.autoSources
  if (!Array.isArray(sources) || sources.length > 2 || sources.some(v => v !== 'SMS' && v !== 'BALE') || new Set(sources).size !== sources.length || autoVerify && !sources.length) throw new PayError('منبع تأیید خودکار معتبر نیست')
  const id = raw.autoBankAccountId == null || raw.autoBankAccountId === '' ? null : Number(raw.autoBankAccountId)
  if (id !== null && (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) || autoVerify && id === null) throw new PayError('حساب تأیید خودکار را انتخاب کنید')
  return { autoVerify, autoSources: (['SMS','BALE'] as const).filter(source => sources.includes(source)), autoBankAccountId: id, autoDisplay: transferDisplay(raw.autoDisplay) }
}
export function isAutomaticTransfer(gateway: { provider: string; config?: string }) {
  return gateway.provider === 'MOBOCOM_PAY' || gateway.provider === 'CARD_TRANSFER' && autoTransferConfig(gateway.config).autoVerify
}
