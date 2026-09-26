import type { PluginServerModule } from '@/extensions/server/types'

export const plugin: PluginServerModule = {
  validateSettings(settings) {
    if (typeof settings['auto-repair'] !== 'boolean') throw new Error('Auto-repair switch is invalid')
    const size = settings['batch-size']
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 20) throw new Error('Batch size must be between 1 and 20')
  },
}
