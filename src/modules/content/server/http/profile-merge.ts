import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject } from '@/platform/http/read-json'
import { ok, err } from '@/platform/http/response'
import { auditAdminStrict } from '@/platform/audit/server'

type Owner = { module: 'cinema' | 'music'; permission: string; search: (q: string, sourceId: number) => Promise<unknown>; preview: (sourceId: number, targetId: number) => Promise<unknown>; merge: (input: Record<string, unknown>, audit: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown> }
export function profileMergeRoutes(owner: Owner) {
  const failure = (error: unknown) => { const e = error as { status?: number; message?: string; code?: string }; return e.code === 'P2034' ? err('اطلاعات هم‌زمان تغییر کرده است؛ پیش‌نمایش را تازه کنید', 409) : e.status && [400, 404, 409, 422].includes(e.status) ? err(e.message || 'ادغام ممکن نیست', e.status) : err('انجام ادغام ممکن نشد؛ دوباره تلاش کنید', 503) }
  return {
    GET: async (req: NextRequest) => {
      const g = await adminGuard(req, owner.module, [owner.permission]); if ('response' in g) return g.response
      const sourceId = Number(req.nextUrl.searchParams.get('sourceId'))
      try { return ok(req.nextUrl.searchParams.has('q') ? { options: await owner.search(String(req.nextUrl.searchParams.get('q')).trim().slice(0, 80), sourceId) } : await owner.preview(sourceId, Number(req.nextUrl.searchParams.get('targetId')))) } catch (e) { return failure(e) }
    },
    POST: async (req: NextRequest) => {
      if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
      const g = await adminGuard(req, owner.module, [owner.permission]); if ('response' in g) return g.response
      if (!(await rateLimitStrict(`profiles.merge:${owner.module}:${g.admin.id}`, 10)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
      let input: Record<string, unknown>
      try { input = await readJsonObject(req, 8192) } catch { return err('درخواست معتبر نیست', 422) }
      try { return ok(await owner.merge(input, tx => auditAdminStrict({ req, actor: g.admin, action: `${owner.module}.profile.merge`, targetType: `${owner.module}-profile`, targetId: Number(input.targetId), metadata: { sourceId: Number(input.sourceId), targetId: Number(input.targetId) } }, tx))) } catch (e) { return failure(e) }
    },
  }
}
