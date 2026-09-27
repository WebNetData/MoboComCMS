import type { NextRequest } from 'next/server'
import { err } from '@/platform/http/response'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'

type Admin = NonNullable<Awaited<ReturnType<typeof requirePerm>>>

/**
 * Admin API guard: the owning module must be on (404 otherwise) and the caller
 * must hold at least one of the permissions (403 otherwise).
 */
export async function adminGuard(req: NextRequest, moduleId: string | null, permissions: readonly string[]): Promise<{ admin: Admin } | { response: Response }> {
  if (moduleId) {
    const off = await moduleGuard(moduleId)
    if (off) return { response: off }
  }
  for (const permission of permissions) {
    const admin = await requirePerm(req, permission)
    if (admin) return { admin }
  }
  return { response: err('forbidden', 403) }
}
