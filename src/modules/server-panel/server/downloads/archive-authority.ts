import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { env } from '@/platform/config/env'
import { resolveCurrentUser, adminNeedsTwoFactor } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { isModuleEnabled } from '@/extensions/server/modules'
import { ipAllowed, parseAllowlist } from '@/modules/server-panel/domain/policy'
import { DownloadError } from '@/modules/server-panel/domain/downloads'
export type ArchiveAuthority = { id: number; authAt: number | null; ip: string }
export async function assertArchiveAuthority(actor: ArchiveAuthority, id: number, reader: Prisma.TransactionClient | typeof db = db) {
  if (env('SERVER_PANEL_ENABLED') !== 'true' || !await isModuleEnabled('server-panel') || !ipAllowed(actor.ip, parseAllowlist(env('SERVER_PANEL_ALLOWED_IPS')))) throw new DownloadError('اختیار پنل سرور تغییر کرده است', 403)
  const user = await resolveCurrentUser(actor.id, actor.authAt ? new Date(actor.authAt) : null, reader)
  if (!user || user.role !== 'ADMIN' || await adminNeedsTwoFactor(user, reader) || (user.roleId !== null && !hasPermission(user.permissions || [], 'server.manage'))) throw new DownloadError('اختیار فعلی سازندهٔ کار معتبر نیست', 403)
  if (!await reader.downloadJob.count({ where: { id, status: 'running', createdBy: actor.id } })) throw new DownloadError('کار لغو یا جایگزین شده است', 409)
  return user
}
