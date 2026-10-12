import type { Prisma } from '@prisma/client'
import { updateJsonSetting, JsonSettingMutationError } from '@/modules/settings/server'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { normalizeSiteHost, RepoError } from '@/modules/repository/domain/repository'
import type { ClientConfig, StoredLicense } from '../client'
import { LICENSES_KEY } from './entitlement'

export type LicenseCommandContext = Pick<AdminAuditInput, 'req' | 'actor'>

/** Local commit only; vendor side effects are outside this transaction and are never retried here. */
export async function commitLicenses<T>(config: ClientConfig, site: string, context: LicenseCommandContext | undefined, action: string, slug: string, mutate: (licenses: Record<string, StoredLicense>, tx: Prisma.TransactionClient) => Promise<T>) {
  try {
    return await updateJsonSetting(LICENSES_KEY, async (value, tx) => {
      const actor = context ? await requirePerm(context.req, 'settings.manage', tx) : undefined
      if (context && (!actor || actor.id !== context.actor.id)) throw new RepoError('forbidden', 403)
      if (await moduleGuard('repository', tx)) throw new RepoError('repository unavailable', 404)
      const row = await tx.setting.findUnique({ where: { key: 'repository.client.v1' } })
      let current: ClientConfig | null
      try { current = row ? JSON.parse(row.value) : null } catch { current = null }
      if (!current || current.url !== config.url || current.publicKey !== config.publicKey || String(current.connectedAt || '') !== config.connectedAt || normalizeSiteHost(await siteBaseUrl(tx)) !== site) throw new RepoError('اتصال مخزن یا نشانی سایت تغییر کرده است؛ دوباره تلاش کنید', 409)
      const result = await mutate(value as Record<string, StoredLicense>, tx)
      if (context && actor) await auditAdminStrict({ req: context.req, actor, action: `repository.client.${action}`, targetType: 'repository', targetId: slug }, tx)
      return result
    })
  } catch (error) {
    if (error instanceof JsonSettingMutationError) throw new RepoError('اطلاعات مجوزها نامعتبر است یا همزمان تغییر کرده است؛ دوباره تلاش کنید', 409)
    throw error
  }
}

export function unchangedLicense(current: StoredLicense | undefined, expected: StoredLicense | undefined) {
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new RepoError('مجوز این محصول همزمان تغییر کرده است؛ دوباره تلاش کنید', 409)
}
