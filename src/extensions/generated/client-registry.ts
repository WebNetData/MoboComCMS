import { plugin as p0 } from '@/plugins/announcement/client'
import { plugin as p1 } from '@/plugins/google-translate/client'
import { plugin as p2 } from '@/plugins/operations-monitor/client'
import { plugin as p3 } from '@/plugins/remnawave-control/client'
import { plugin as p4 } from '@/plugins/support-dock/client'
import type { PluginClientModule } from '@/plugins/types'
export const clientPlugins: Readonly<Record<string, PluginClientModule>> = {
  'announcement': p0,
  'google-translate': p1,
  'operations-monitor': p2,
  'remnawave-control': p3,
  'support-dock': p4
}
