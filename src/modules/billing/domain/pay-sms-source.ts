import { normalizeSmsTemplate, normalizedSmsText, type SmsTemplateConfig } from './pay-sms-template'

export type SmsSourceFormat = 'EXTENDED_V1' | 'FORWARDER_V1'
export function smsSourceConfig(input: unknown): { template: SmsTemplateConfig; format: SmsSourceFormat } {
  if (input && typeof input === 'object' && !Array.isArray(input) && Object.hasOwn(input, 'version')) {
    const row = input as Record<string, unknown>
    if (Object.keys(row).length !== 3 || row.version !== 2 || row.format !== 'FORWARDER_V1' || !Object.hasOwn(row, 'template')) throw new Error('Invalid SMS source configuration')
    return { template: normalizeSmsTemplate(row.template), format: row.format }
  }
  return { template: normalizeSmsTemplate(input), format: 'EXTENDED_V1' }
}
export const smsSourceStorage = (template: SmsTemplateConfig, format: SmsSourceFormat) => JSON.stringify(format === 'FORWARDER_V1' ? { version: 2, format, template } : template)
/** Stable across JSON formatting, numeral forms and harmless whitespace, excluding credentials/time/version. */
export const forwardedSmsIdentity = (sourceId: string, bank: string, message: string) => JSON.stringify(['SMS_FORWARDER_V1', sourceId, bank, normalizedSmsText(message).replace(/٬/g, ',')])
