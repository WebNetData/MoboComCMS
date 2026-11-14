import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject } from '@/platform/http/read-json'
import { err, ok } from '@/platform/http/response'
import { CanonicalAliasError, OWNERS, aliasSource, aliasTargetId, canonicalAliasCandidates, cleanId, createCanonicalAlias, entity, previewCanonicalAlias, undoCanonicalAlias, type CanonicalAliasKind } from './core'
const kindOf = (value: unknown): CanonicalAliasKind | null => ['product', 'cinema', 'game', 'software'].includes(String(value)) ? value as CanonicalAliasKind : null

export function canonicalAliasRoutes() {
  const failure = (error: unknown) => { const value = error as { status?: number; message?: string }; return err(value.status && [400, 403, 404, 409, 422].includes(value.status) ? value.message || 'هم‌نشانی انجام نشد' : 'هم‌نشانی انجام نشد', value.status || 503) }
  const guard = async (req: NextRequest, kind: CanonicalAliasKind) => adminGuard(req, OWNERS[kind].module, [OWNERS[kind].permission])
  return {
    GET: async (req: NextRequest) => {
      const kind = kindOf(req.nextUrl.searchParams.get('kind'))
      if (!kind) return err('نوع رکورد معتبر نیست', 400)
      const g = await guard(req, kind); if ('response' in g) return g.response
      try {
        const sourceId = cleanId(req.nextUrl.searchParams.get('sourceId'))
        const targetId = cleanId(req.nextUrl.searchParams.get('targetId'))
        if (!sourceId) return err('شناسهٔ مبدأ معتبر نیست', 400)
        if (req.nextUrl.searchParams.get('undo') === '1') {
          const alias = await aliasSource(db, kind, sourceId)
          if (!alias) return err('هم‌نشانی پیدا نشد', 404)
          const targetId = aliasTargetId(alias, kind)
          const [source, target] = await Promise.all([entity(db, kind, sourceId), entity(db, kind, targetId)])
          if (!source || !target) return err('یکی از رکوردها پیدا نشد', 404)
          return ok({ source: { id: source.id, version: source.updatedAt.toISOString() }, target: { id: target.id, version: target.updatedAt.toISOString() }, targetId, sourcePath: alias.sourcePath, targetPath: alias.targetPath, effect: 'هم‌نشانی غیرفعال و مبدأ با همان وضعیت قبلی بازگردانده می‌شود.' })
        }
        return targetId ? ok(await previewCanonicalAlias(kind, sourceId, targetId)) : ok(await canonicalAliasCandidates(kind, sourceId))
      } catch (error) { return failure(error) }
    },
    POST: async (req: NextRequest) => {
      const origin = req.headers.get('origin')
      if (!origin || !originIsThisSite(origin, req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
      let input: Record<string, unknown>
      try { input = await readJsonObject(req, 8192) } catch { return err('درخواست معتبر نیست', 422) }
      const kind = kindOf(input.kind)
      if (!kind) return err('نوع رکورد معتبر نیست', 400)
      const g = await guard(req, kind); if ('response' in g) return g.response
      const reviewerId = cleanId(g.admin.id)
      if (!reviewerId) return err('کاربر بازبینی معتبر نیست', 403)
      const reviewer = { id: reviewerId, email: g.admin.email }
      if (!(await rateLimitStrict(`canonical-alias:${kind}:${reviewerId}`, 10)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
      try {
        const sourceId = cleanId(input.sourceId), targetId = cleanId(input.targetId)
        if (input.action === 'undo') return ok(await undoCanonicalAlias(kind, sourceId, String(input.sourceVersion || ''), String(input.targetVersion || ''), reviewer, req))
        if (input.confirm !== true) return err('برای ثبت هم‌نشانی، تأیید بازبینی لازم است', 422)
        return ok(await createCanonicalAlias({ kind, sourceId, targetId, sourceVersion: String(input.sourceVersion || ''), targetVersion: String(input.targetVersion || ''), reviewer }, req))
      } catch (error) { return failure(error) }
    },
  }
}
