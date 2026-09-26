import { serverPlugins } from '@/extensions/generated/server-registry'
import { isExtensionEnabled } from './state'
import { enqueueExtensionJob, extensionStorage } from '@/extensions/sdk/server'
import type { CoreExtensionEventMap, CoreExtensionEventName, ExtensionEventHandler } from '@/extensions/server/types'

export async function emitExtensionEvent<K extends CoreExtensionEventName>(name: K, payload: CoreExtensionEventMap[K]) {
  const errors: { pluginId: string; error: unknown }[] = []
  for (const [pluginId, plugin] of Object.entries(serverPlugins)) {
    const handler = plugin.events?.[name] as ExtensionEventHandler<CoreExtensionEventMap[K]> | undefined
    if (!handler || !(await isExtensionEnabled(pluginId))) continue
    try {
      await handler(payload, {
        pluginId,
        storage: extensionStorage(pluginId),
        enqueueJob: (jobName, jobPayload, dedupeKey) => enqueueExtensionJob(pluginId, jobName, jobPayload, dedupeKey),
      })
    } catch (error) {
      errors.push({ pluginId, error })
      console.error(`[extension:${pluginId}] event ${name} failed`, error)
    }
  }
  return errors
}
