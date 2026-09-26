import type { PluginServerModule } from '@/extensions/server/types'

function boundedNumber(settings: Readonly<Record<string, unknown>>, key: string, min: number, max: number) {
  const value = settings[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer from ${min} to ${max}`)
  return value
}

export const plugin: PluginServerModule = {
  validateSettings(settings) {
    if (typeof settings.alerts !== 'boolean') throw new Error('Alert switch is invalid')
    const chat = settings['chat-id']
    if (typeof chat !== 'string' || (chat && !/^[1-9]\d{0,19}$/.test(chat))) throw new Error('Enter a numeric Telegram user ID')
    if (settings.alerts && !chat) throw new Error('Enter a Telegram user ID before enabling alerts')
    const warning = boundedNumber(settings, 'disk-warning', 1, 95)
    const critical = boundedNumber(settings, 'disk-critical', 2, 99)
    if (critical <= warning) throw new Error('Critical disk threshold must exceed the warning threshold')
    boundedNumber(settings, 'backup-max-age-hours', 1, 168)
    boundedNumber(settings, 'order-wait-minutes', 1, 1440)
  },
}
