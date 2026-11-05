import { randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { readJsonSetting, updateJsonSetting, type SectionSettingsContext } from '@/modules/settings/server'
import { auditAdminStrict } from '@/platform/audit/server'
import { getExtensionState } from '@/extensions/server/state'
import type { AutomaticForwarderPolicy } from '../domain/automatic'
import {
  ForwarderError, isBlocked, normalizeForwarderSettings, normalizeSlug, normalizeTarget, parseForwarderPath, randomSlug, slugProblem,
  type ForwarderSettings,
} from '@/modules/forwarder/domain/forwarder'

const KEY = 'forwarder.v1'

export async function getForwarderSettings(): Promise<ForwarderSettings> {
  return normalizeForwarderSettings(await readJsonSetting(KEY).catch(() => undefined))
}

export async function saveForwarderSettings(input: unknown, context?: SectionSettingsContext) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ForwarderError('تنظیمات معتبر نیست', 422)
  const patch = Object.fromEntries(Object.entries(input).filter(([key]) => Object.hasOwn(normalizeForwarderSettings({}), key)))
  for (const [key, value] of Object.entries(patch)) {
    const sample = normalizeForwarderSettings({})[key as keyof ForwarderSettings]
    if (Array.isArray(sample) ? !Array.isArray(value) || value.some(host => typeof host !== 'string') : typeof value !== typeof sample || (typeof value === 'number' && !Number.isFinite(value))) throw new ForwarderError('تنظیمات معتبر نیست', 422)
  }
  return updateJsonSetting(KEY, async (stored, tx) => {
    const normalized = normalizeForwarderSettings({ ...stored, ...patch })
    for (const key of Object.keys(patch)) stored[key] = normalized[key as keyof ForwarderSettings]
    const settings = normalizeForwarderSettings(stored)
    if (context) await auditAdminStrict({ ...context, action: 'forwarder.settings', targetType: 'setting', targetId: KEY, metadata: { enabled: settings.enabled, autoExternalLinks: settings.autoExternalLinks, countdown: settings.countdown, allowRawUrls: settings.allowRawUrls } }, tx)
    return settings
  })
}

/** Fresh reads also make old generated URLs safe after a setting/extension is disabled. */
export async function getAutomaticForwarderPolicy(): Promise<AutomaticForwarderPolicy> {
  let siteHost = ''
  try { siteHost = new URL(process.env.NEXTAUTH_URL || '').hostname } catch { /* current browser host still applies */ }
  try {
    const [raw, extension] = await Promise.all([readJsonSetting(KEY, db), getExtensionState('forwarder', [], db, true)])
    const settings = normalizeForwarderSettings(raw)
    return { enabled: extension.enabled && settings.enabled && settings.autoExternalLinks, siteHost }
  } catch { return { enabled: false, siteHost } }
}

// ------------------------------------------------------------------ links (admin)

export async function listShortLinks(input: { q?: string; page?: number }) {
  const page = Math.max(1, Math.min(1000, Math.floor(Number(input.page) || 1)))
  const q = String(input.q || '').trim().slice(0, 100)
  const where = q ? { OR: [{ slug: { contains: q.toLowerCase() } }, { target: { contains: q } }, { title: { contains: q } }] } : {}
  const [rows, total, clicks] = await Promise.all([
    db.shortLink.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30 }),
    db.shortLink.count({ where }),
    db.shortLink.aggregate({ _sum: { clicks: true }, _count: { _all: true } }),
  ])
  return { page, pages: Math.max(1, Math.ceil(total / 30)), total, stats: { links: clicks._count._all, clicks: clicks._sum.clicks || 0 }, rows }
}

function checkedTarget(input: unknown, settings: ForwarderSettings) {
  const target = normalizeTarget(input)
  if (!target.ok) throw new ForwarderError(target.reason)
  if (isBlocked(target.host, settings.blockedHosts)) throw new ForwarderError('این دامنه در فهرست مسدود است')
  return target
}

const countdownOf = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : null
}

/** Creates a short link; without a slug a random one is made. */
export async function createShortLink(input: { slug?: unknown; target: unknown; title?: unknown; countdown?: unknown; actorId: number }) {
  const settings = await getForwarderSettings()
  const target = checkedTarget(input.target, settings)
  const wanted = normalizeSlug(input.slug)
  if (wanted) {
    const problem = slugProblem(wanted)
    if (problem) throw new ForwarderError(problem)
  }
  const title = String(input.title ?? '').replace(/[<>]/g, '').trim().slice(0, 120)
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = wanted || randomSlug((max) => randomInt(max), attempt < 4 ? 6 : 8)
    try {
      return await db.shortLink.create({ data: { slug, target: target.url, title, countdown: countdownOf(input.countdown), createdBy: input.actorId } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (wanted) throw new ForwarderError('این نامک قبلاً استفاده شده است', 409)
        continue
      }
      throw error
    }
  }
  throw new ForwarderError('ساخت نامک تصادفی انجام نشد؛ دوباره تلاش کنید', 500)
}

export async function updateShortLink(id: number, input: { slug?: unknown; target?: unknown; title?: unknown; countdown?: unknown; active?: unknown }) {
  const settings = await getForwarderSettings()
  const data: Prisma.ShortLinkUpdateInput = {}
  if (input.target !== undefined) data.target = checkedTarget(input.target, settings).url
  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug)
    const problem = slugProblem(slug)
    if (problem) throw new ForwarderError(problem)
    data.slug = slug
  }
  if (input.title !== undefined) data.title = String(input.title).replace(/[<>]/g, '').trim().slice(0, 120)
  if (input.countdown !== undefined) data.countdown = countdownOf(input.countdown)
  if (typeof input.active === 'boolean') data.active = input.active
  try {
    return await db.shortLink.update({ where: { id }, data })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ForwarderError('این نامک قبلاً استفاده شده است', 409)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new ForwarderError('لینک پیدا نشد', 404)
    throw error
  }
}

export const deleteShortLink = (id: number) => db.shortLink.delete({ where: { id } }).catch(() => null)

// ------------------------------------------------------------------ public

export type ForwardPage =
  | { ok: true; url: string; host: string; title: string; countdown: number; settings: ForwarderSettings; slug: string | null; bypass?: boolean }
  | { ok: false; reason: 'off' | 'not-found' | 'blocked' | 'invalid' | 'raw-off'; message: string; settings: ForwarderSettings }

/** Resolves /forwarder/<segment> and counts the visit for saved links (not for crawlers). */
export async function resolveForward(segment: string, options: { count: boolean; automatic?: boolean; rawTarget?: string }): Promise<ForwardPage> {
  const settings = options.automatic ? normalizeForwarderSettings(await readJsonSetting(KEY, db)) : await getForwarderSettings()
  if (!settings.enabled && !options.automatic) return { ok: false, reason: 'off', message: 'انتقال لینک غیرفعال است.', settings }
  const parsed = options.rawTarget !== undefined ? { kind: 'raw' as const, target: options.rawTarget } : parseForwarderPath(segment)
  if (parsed.kind === 'raw') {
    if (!settings.allowRawUrls && !options.automatic) return { ok: false, reason: 'raw-off', message: 'فقط لینک‌های ثبت‌شده قابل استفاده‌اند.', settings }
    const target = normalizeTarget(parsed.target)
    if (!target.ok) return { ok: false, reason: 'invalid', message: target.reason, settings }
    if (isBlocked(target.host, settings.blockedHosts)) return { ok: false, reason: 'blocked', message: 'انتقال به این دامنه مسدود است.', settings }
    const bypass = options.automatic ? !(await getAutomaticForwarderPolicy()).enabled : false
    return { ok: true, url: target.url, host: target.host, title: '', countdown: settings.countdown, settings, slug: null, bypass }
  }
  const link = parsed.slug ? await db.shortLink.findUnique({ where: { slug: parsed.slug } }) : null
  if (!link || !link.active) return { ok: false, reason: 'not-found', message: 'این لینک وجود ندارد یا غیرفعال شده است.', settings }
  const target = normalizeTarget(link.target)
  if (!target.ok) return { ok: false, reason: 'invalid', message: target.reason, settings }
  if (isBlocked(target.host, settings.blockedHosts)) return { ok: false, reason: 'blocked', message: 'انتقال به این دامنه مسدود است.', settings }
  if (options.count) await db.shortLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 }, lastClickAt: new Date() } }).catch(() => null)
  return { ok: true, url: target.url, host: target.host, title: link.title, countdown: link.countdown ?? settings.countdown, settings, slug: link.slug }
}
