import { plugin as p0 } from '@/plugins/ads/client'
import { plugin as p1 } from '@/plugins/announcement/client'
import { plugin as p2 } from '@/plugins/google-translate/client'
import { plugin as p3 } from '@/plugins/livechat/client'
import { plugin as p4 } from '@/plugins/operations-monitor/client'
import { plugin as p5 } from '@/plugins/remnawave-control/client'
import type { PluginClientModule } from '@/plugins/types'
export const clientPlugins: Readonly<Record<string, PluginClientModule>> = {
  'ads': p0,
  'announcement': p1,
  'google-translate': p2,
  'livechat': p3,
  'operations-monitor': p4,
  'remnawave-control': p5
}
