import { plugin as s0 } from '@/plugins/operations-monitor/server'
import { plugin as s1 } from '@/plugins/remnawave-control/server'
import type { PluginServerModule } from '@/extensions/server/types'
export const serverPlugins: Readonly<Record<string, PluginServerModule>> = {
  'operations-monitor': s0,
  'remnawave-control': s1
}
