import { NextRequest } from 'next/server'
import { socialImage } from '@/modules/social/server/images'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { isModuleEnabled } from '@/extensions/server/modules'
import { parseItemKey } from '@/modules/content/domain/items'
import { itemCard } from '@/modules/content/server/registry'
import { siteBase } from '@/modules/site/server/seo'
import { CHANNELS, type Channel } from '@/modules/social/domain/social'
import {
  enqueueAnnouncement, getSocialSettings, processSocialQueue, publicSocialSettings, saveSocialSettings, socialLog, socialSample, socialStats, testTelegram,
} from '@/modules/social/server/social'
import { db } from '@/platform/database/prisma'

const guard = (req: NextRequest) => adminGuard(req, 'social-publisher', ['social.manage', 'settings.manage'])

/** GET /api/admin/social?page= — settings and the announcement log. */
export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1)
  const filter = { channel: req.nextUrl.searchParams.get('channel') || '', status: req.nextUrl.searchParams.get('status') || '' }
  const [settings, log, pending, stats, sample] = await Promise.all([getSocialSettings(), socialLog(page, filter), db.socialPost.count({ where: { status: 'PENDING' } }), socialStats(), socialSample().catch(() => null)])
  return ok({ settings: publicSocialSettings(settings), log, pending, stats, sample, base: await siteBase() })
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const saved = await saveSocialSettings((await req.json().catch(() => null)) || {})
  await auditAdmin({ req, actor: g.admin, action: 'social.settings.update', targetType: 'setting', targetId: 'social.config.v1' })
  return ok({ settings: publicSocialSettings(saved) })
}

/** POST { action: test-telegram | run | announce | retry, item?, channels?, id? } */
export async function POST(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.action === 'test-telegram') return ok(await testTelegram())
    if (body.action === 'run') return ok({ handled: await processSocialQueue(50) })
    if (body.action === 'retry') {
      const id = Number(body.id)
      await db.socialPost.updateMany({ where: { id, status: { in: ['FAILED', 'SKIPPED'] } }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), error: '' } })
      return ok({ handled: await processSocialQueue(10) })
    }
    if (body.action === 'announce') {
      const ref = parseItemKey(body.item)
      if (!ref || !await itemCard(ref)) return err('مورد منتشرشده‌ای با این شناسه پیدا نشد', 404)
      const channels = Array.isArray(body.channels) ? body.channels.filter((c: unknown): c is Channel => CHANNELS.includes(c as Channel)) : undefined
      const queued = await enqueueAnnouncement(ref, new Date(), { force: true, channels })
      await auditAdmin({ req, actor: g.admin, action: 'social.announce', targetType: ref.type, targetId: ref.id, metadata: { channels: queued } })
      return ok({ queued })
    }
    return err('unknown action')
  } catch (error) {
    return err(error instanceof Error ? error.message : 'انجام نشد', 400)
  }
}

/**
 * GET /api/social/image/software-12.jpg — the item cover as a 1080×1350 JPEG
 * (Instagram accepts JPEG only). Resolves the image from the item itself, so
 * this is not an open proxy.
 */
export async function GET_image(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  if (!await isModuleEnabled('social-publisher')) return err('not found', 404)
  const match = /^([a-z]+)-(\d+)\.jpg$/.exec((await params).file)
  const ref = match && parseItemKey(`${match[1]}:${match[2]}`)
  const item = ref ? await itemCard(ref) : null
  if (!item?.image) return err('not found', 404)
  const base = await siteBase()
  try {
    const jpeg = await socialImage(item.image, base)
    return new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } })
  } catch {
    return err('image conversion failed', 502)
  }
}
