import type { NextRequest } from 'next/server'
import { hasPermission } from '@/modules/identity/rbac'
import { db } from '@/platform/database/prisma'
import { ok, err } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { auditAdminStrict } from '@/platform/audit/server'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { LibraryError } from '@/modules/media/domain/library'
import { libraryActor, currentLibraryUser, libraryTransaction } from './authority'
import { libraryCommand, queryLibrary } from './commands'
import { listTransfers, requestTransfer, transferCommand } from './transfers'
import { mediaSettings, MEDIA_SETTINGS_KEY, normalizeMediaSettings } from './settings'
import { recordRevision } from '@/modules/content/server/revisions'
import { compatibleAudioJobs, inspectCompatibleAudio, requestCompatibleAudio } from './compatible-audio'
const failure = (error: unknown) => (error instanceof LibraryError || error instanceof JsonBodyError) ? err(error.message, error.status) : err('عملیات کتابخانه انجام نشد؛ دوباره تلاش کنید', 500)
export async function GET(req: NextRequest) {
  try {
    const actor = await libraryActor(req)
    if (req.nextUrl.searchParams.get('view') === 'audio') return ok({ items: await compatibleAudioJobs(actor) })
    if (req.nextUrl.searchParams.get('view') === 'transfers') return ok({ items: await listTransfers(actor) })
    if (req.nextUrl.searchParams.get('view') === 'settings') {
      if (!(await currentLibraryUser(actor)).configureLibrary) return err('forbidden', 403)
      return ok(await mediaSettings())
    }
    return ok(await queryLibrary(actor, req.nextUrl.searchParams))
  } catch (e) { return failure(e) }
}
export async function POST(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  try {
    const actor = await libraryActor(req)
    await currentLibraryUser(actor)
    const input = await readJsonObject(req)
    const audio = String(input.action).startsWith('audio.')
    const limit = await rateLimitStrict(`${audio ? 'media-audio' : 'media-library'}:${actor.id}`, audio ? 12 : input.action === 'transfer.create' ? 30 : 120, 60000)
    if (!limit.ok) return err('کمی صبر کنید و دوباره تلاش کنید', 429, { retryAfter: limit.retryAfter })
    if (input.action === 'audio.inspect') return ok(await inspectCompatibleAudio(actor, String(input.assetId)))
    if (input.action === 'audio.create') return ok(await requestCompatibleAudio(actor, input, req))
    if (input.action === 'transfer.create') return ok(await requestTransfer(actor, input, req))
    if (String(input.action).startsWith('transfer.')) return ok(await transferCommand(actor, input, req))
    if (input.action === 'settings.save') return ok(await libraryTransaction(async tx => {
      const user = await currentLibraryUser(actor, tx)
      // Global intake policy remains an Admin Control Plane setting.
      if (!(user.roleId == null || hasPermission(user.permissions || [], 'settings.manage'))) throw new LibraryError('تنظیمات عمومی به مدیر تنظیمات اختصاص دارد', 403)
      const existing = await tx.setting.findUnique({ where: { key: MEDIA_SETTINGS_KEY } })
      if ((existing?.value || null) !== input.stamp) throw new LibraryError('تنظیمات هم‌زمان تغییر کرده؛ دوباره بارگیری کنید', 409)
        if (!input.value || typeof input.value !== 'object' || Array.isArray(input.value)) throw new LibraryError('تنظیمات کتابخانه معتبر نیست', 422)
        const before = normalizeMediaSettings(JSON.parse(existing?.value || '{}')), after = normalizeMediaSettings({ ...JSON.parse(existing?.value || '{}'), ...input.value as Record<string, unknown> })
       const value = JSON.stringify({ ...JSON.parse(existing?.value || '{}'), ...after })
      if (existing) await tx.setting.updateMany({ where: { key: MEDIA_SETTINGS_KEY, value: existing.value }, data: { value } })
      else await tx.setting.create({ data: { key: MEDIA_SETTINGS_KEY, value } })
       await recordRevision({ entityType: 'settings-media', entityId: 1, before, after, actor: user, client: tx, strict: true })
      await auditAdminStrict({ req, actor: user, action: 'media.settings.updated', targetType: 'setting', targetId: MEDIA_SETTINGS_KEY }, tx)
      return { saved: true }
    }))
    return ok(await libraryCommand(actor, input, req))
  } catch (e) { return failure(e) }
}

/** A copied file by its transfer id; a picture asked at a width (?w=) keeps asking for it at its stored address. */
export async function publicTransfer(id: string, width?: string | null) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return err('not_found', 404)
  const row = await db.mediaTransfer.findUnique({ where: { id }, include: { asset: true } })
  if (!row || row.status === 'CANCELLED') return err('not_found', 404)
  const stored = row.status === 'READY' && row.asset ? (await import('./catalog')).assetUrl(row.asset) : row.sourceUrl
  const url = width && /^\d{2,4}$/.test(width) && stored.startsWith('/files/') ? `${stored}?w=${width}` : stored
  return new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } })
}
