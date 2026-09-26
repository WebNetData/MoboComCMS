import type { NextRequest } from 'next/server'
import { err } from '@/platform/http/response'
import { serverPlugins } from '@/extensions/generated/server-registry'
import { isExtensionEnabled } from '@/extensions/server/state'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { enqueueExtensionJob, extensionStorage } from '@/extensions/sdk/server'
import type { ExtensionActor } from '@/extensions/server/types'

export async function dispatchExtensionApi(req: NextRequest, pluginId: string, pathParts: readonly string[]) {
  const plugin = serverPlugins[pluginId]
  if (!plugin || !(await isExtensionEnabled(pluginId))) return err('extension not found', 404)
  const routePath = '/' + pathParts.join('/')
  const route = plugin.api?.find(item => item.method === req.method && item.path === routePath)
  if (!route) return err('extension route not found', 404)

  let actor: ExtensionActor | null = null
  if (route.access === 'authenticated') {
    actor = await requireUser(req)
    if (!actor) return err('unauthorized', 401)
  } else if (route.access.startsWith('permission:')) {
    const permission = route.access.slice('permission:'.length)
    actor = await requirePerm(req, permission)
    if (!actor) return err('forbidden', 403)
  }

  return route.handler(req, {
    pluginId,
    path: pathParts,
    actor,
    storage: extensionStorage(pluginId),
    enqueueJob: (jobName, jobPayload, dedupeKey) => enqueueExtensionJob(pluginId, jobName, jobPayload, dedupeKey),
  })
}
