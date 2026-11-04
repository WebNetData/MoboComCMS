import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { HostingError } from '@/modules/hosting/domain/catalog'
import {
  adminHostingCatalog, deleteHostingProduct, deleteHostingProvider, saveHostingProduct, saveHostingProvider, testHostingProvider,
} from '@/modules/hosting/server/catalog'

const PERMISSIONS = ['hosting.manage']

/** GET /api/admin/hosting — products, prices and connected systems (secrets only as present or not). */
export async function GET_admin(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  const response = ok(await adminHostingCatalog())
  response.headers.set('cache-control', 'private, no-store')
  return response
}

/** POST /api/admin/hosting { op: save-product | delete-product | save-provider | delete-provider | test-provider, … } */
export async function POST_admin(req: NextRequest) {
  const g = await adminGuard(req, 'hosting', PERMISSIONS)
  if ('response' in g) return g.response
  const body = await req.json().catch(() => null)
  const id = Number(body?.id) || 0
  try {
    switch (body?.op) {
      case 'save-product': {
        const saved = await saveHostingProduct(body.product || {})
        await auditAdmin({ req, actor: g.admin, action: 'hosting.product.save', targetType: 'hosting-product', targetId: saved.id })
        return ok({ product: saved })
      }
      case 'delete-product':
        if (!await deleteHostingProduct(id)) return err('محصول پیدا نشد', 404)
        await auditAdmin({ req, actor: g.admin, action: 'hosting.product.delete', targetType: 'hosting-product', targetId: id })
        return ok({ ok: true })
      case 'save-provider': {
        const saved = await saveHostingProvider(body.provider || {})
        // The secret itself is never written to the audit row.
        await auditAdmin({ req, actor: g.admin, action: 'hosting.provider.save', targetType: 'hosting-provider', targetId: saved.id, metadata: { secretChanged: Boolean(String(body.provider?.secret || '').trim()) } })
        return ok({ provider: saved })
      }
      case 'delete-provider':
        if (!await deleteHostingProvider(id)) return err('سامانه پیدا نشد', 404)
        await auditAdmin({ req, actor: g.admin, action: 'hosting.provider.delete', targetType: 'hosting-provider', targetId: id })
        return ok({ ok: true })
      case 'test-provider': {
        // Each check calls an outside system; a few a minute per person is plenty.
        if (!(await rateLimitStrict(`hosting:test:${g.admin.id}`, 10, 60_000)).ok) return err('چند لحظه بعد دوباره امتحان کنید', 429)
        const result = await testHostingProvider(id)
        await auditAdmin({ req, actor: g.admin, action: 'hosting.provider.test', targetType: 'hosting-provider', targetId: id, metadata: { ok: result.ok } })
        return ok(result)
      }
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) {
    if (error instanceof HostingError) return err(error.message)
    throw error
  }
}
