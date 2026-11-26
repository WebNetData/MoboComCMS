import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { err, ok } from '@/platform/http/response'
import { HostingError } from '@/modules/hosting/domain/catalog'
import { operationOverview, operateCloudResource, reconcileCloudOperation, retryCloudOperation } from './commands'
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, 'hosting', ['hosting.manage'])
  if ('response' in guard) return guard.response
  const response = ok(await operationOverview())
  response.headers.set('cache-control', 'private, no-store')
  return response
}
export async function POST(req: NextRequest) {
  const guard = await adminGuard(req, 'hosting', ['hosting.manage'])
  if ('response' in guard) return guard.response
  if (!(await rateLimitStrict('hosting-operations:' + guard.admin.id, 20, 60000)).ok)
    return err('کمی بعد تلاش کنید', 429)
  try {
    const body = await readJsonObject(req, 4000),
      result =
        body.op === 'reconcile'
          ? await reconcileCloudOperation(guard.admin.id, String(body.id), Number(body.version))
          : body.op === 'retry'
            ? await retryCloudOperation(guard.admin.id, String(body.id), Number(body.version))
            : body.op === 'command'
              ? await operateCloudResource(guard.admin.id, body)
              : null
    if (!result) return err('عملیات معتبر نیست')
    return ok({ id: result.id })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') return err('درخواست پیدا نشد', 404)
    if (error instanceof JsonBodyError) return err(error.message, error.status)
    if (error instanceof HostingError) return err(error.message, 409)
    throw error
  }
}
