import { db } from '@/platform/database/prisma'
import { updateJsonSetting, JsonSettingMutationError } from '@/modules/settings/server'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { auditAdminStrict } from '@/platform/audit/server'
import { RepoError } from '@/modules/repository/domain/repository'
import type { ClientConfig } from '../client'
import type { LicenseCommandContext } from './license-commit'

const CONFIG_KEY = 'repository.client.v1'

/** Fresh snapshot before provider IO; corrupt data must not be mistaken for a disconnected site. */
export async function captureConnection() {
  const row = await db.setting.findUnique({ where: { key: CONFIG_KEY } })
  try {
    const value: unknown = row ? JSON.parse(row.value) : {}
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object')
    return JSON.stringify(value)
  } catch { throw new RepoError('Repository connection data is invalid; recover it before changing the connection', 409) }
}

/** Provider IO never runs inside this repeatable Settings transaction. */
export async function commitConnection(expected: string, next: ClientConfig | null, context?: LicenseCommandContext) {
  try {
    await updateJsonSetting(CONFIG_KEY, async (current, tx) => {
      const actor = context ? await requirePerm(context.req, 'settings.manage', tx) : undefined
      if (context && (!actor || actor.id !== context.actor.id)) throw new RepoError('forbidden', 403)
      if (await moduleGuard('repository', tx)) throw new RepoError('repository unavailable', 404)
      if (JSON.stringify(current) !== expected) throw new RepoError('Repository connection changed; retry the command', 409)
      for (const key of Object.keys(current)) delete current[key]
      if (next) Object.assign(current, next)
      if (context && actor) await auditAdminStrict({ req: context.req, actor, action: `repository.client.${next ? 'connect' : 'disconnect'}`, targetType: 'repository', targetId: next?.url || 'client', metadata: next ? { fingerprint: next.fingerprint } : {} }, tx)
    })
  } catch (error) {
    if (error instanceof JsonSettingMutationError) throw new RepoError('Repository connection data is invalid or changed concurrently', 409)
    throw error
  }
}
