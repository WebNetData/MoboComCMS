import { randomBytes } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { ITEM_LABEL, parseItemKey, parseItemPath, type ItemRef } from '@/modules/content/domain/items'
import { itemBySlug, type ItemCard } from '@/modules/content/server/registry'
import { contentChanged } from '@/modules/content/server/events'
import { CopyrightError, STATUS_LABEL, normalizeCode, trackingCode, validateReport, type ReportStatus } from '@/modules/copyright/domain/copyright'

/** Resolves reported URLs to public items on this site (other URLs are kept as text). */
async function resolveUrls(urls: string[]) {
  const results: { url: string; item: ItemCard | null }[] = []
  for (const url of urls) {
    const parsed = parseItemPath(url)
    results.push({ url, item: parsed ? await itemBySlug(parsed.type, parsed.slug) : null })
  }
  return results
}

export async function submitReport(input: Record<string, unknown>, visitor: string) {
  if (!rateLimitHit(`copyright:${visitor}`, 5, 86_400_000).ok) throw new CopyrightError('در ۲۴ ساعت گذشته گزارش‌های زیادی ثبت کرده‌اید؛ برای موارد بیشتر با پشتیبانی تماس بگیرید.', 429)
  const report = validateReport(input)
  const [first] = (await resolveUrls(report.infringingUrls.slice(0, 1)))
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = trackingCode(randomBytes(8))
    try {
      await db.copyrightReport.create({ data: {
        code, name: report.name, email: report.email, organization: report.organization, phone: report.phone, role: report.role,
        workTitle: report.workTitle, originalUrl: report.originalUrl, infringingUrls: report.infringingUrls.join('\n'),
        description: report.description, signature: report.signature, visitor,
        itemType: first?.item?.type || '', itemId: first?.item?.id ?? null,
      } })
      return { code }
    } catch (error) {
      if (!/Unique constraint/i.test(error instanceof Error ? error.message : '')) throw error
    }
  }
  throw new CopyrightError('ثبت گزارش انجام نشد؛ دوباره تلاش کنید', 500)
}

/** Public status lookup: the code and the reporter's email must both match. */
export async function reportStatus(code: unknown, email: unknown) {
  const row = await db.copyrightReport.findUnique({ where: { code: normalizeCode(code) } })
  if (!row || row.email !== String(email || '').trim().toLowerCase()) throw new CopyrightError('گزارشی با این کد و ایمیل پیدا نشد', 404)
  return { code: row.code, status: row.status, label: STATUS_LABEL[row.status as ReportStatus] || row.status, resolution: row.resolution, createdAt: row.createdAt, resolvedAt: row.resolvedAt, workTitle: row.workTitle }
}

// ------------------------------------------------------------------ admin

export async function reportList(status: string) {
  const where = status === 'ALL' ? {} : { status: ['NEW', 'REVIEWING', 'ACCEPTED', 'REJECTED'].includes(status) ? status : 'NEW' }
  const [rows, open] = await Promise.all([
    db.copyrightReport.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.copyrightReport.count({ where: { status: { in: ['NEW', 'REVIEWING'] } } }),
  ])
  return { open, reports: rows.map((row) => ({ ...row, visitor: undefined, infringingUrls: row.infringingUrls.split('\n').filter(Boolean) })) }
}

const LINK_OWNERS: Partial<Record<ItemRef['type'], string>> = { software: 'software', game: 'game', title: 'title' }

/** One report with its URLs resolved to items and their download links. */
export async function reportDetail(id: number) {
  const row = await db.copyrightReport.findUnique({ where: { id } })
  if (!row) throw new CopyrightError('گزارش پیدا نشد', 404)
  const resolved = await resolveUrls(row.infringingUrls.split('\n').filter(Boolean))
  const targets = await Promise.all(resolved.map(async ({ url, item }) => {
    if (!item) return { url, item: null, links: [] }
    const owner = LINK_OWNERS[item.type]
    let links: { id: number; label: string; quality: string; url: string; disabled: boolean }[] = []
    if (owner) {
      const episodes = item.type === 'title' ? (await db.cinemaEpisode.findMany({ where: { season: { titleId: item.id } }, select: { id: true } })).map((e) => e.id) : []
      const updates = item.type === 'game' ? (await db.gameUpdate.findMany({ where: { gameId: item.id }, select: { id: true } })).map((u) => u.id) : []
      const releases = item.type === 'software' ? (await db.softwareRelease.findMany({ where: { softwareId: item.id }, select: { id: true } })).map((release) => release.id) : []
      links = await db.mediaLink.findMany({ where: { OR: [{ ownerType: owner, ownerId: item.id }, ...(episodes.length ? [{ ownerType: 'episode', ownerId: { in: episodes } }] : []), ...(updates.length ? [{ ownerType: 'gameupdate', ownerId: { in: updates } }] : []), ...(releases.length ? [{ ownerType: 'softwarerelease', ownerId: { in: releases } }] : [])] }, select: { id: true, label: true, quality: true, url: true, disabled: true }, orderBy: { id: 'asc' } })
    }
    return { url, item: { type: item.type, id: item.id, title: item.title, url: item.url, label: ITEM_LABEL[item.type].one }, links }
  }))
  return { report: { ...row, visitor: undefined, infringingUrls: row.infringingUrls.split('\n').filter(Boolean) }, targets }
}

/** Unpublishes an item (kept in the database so the decision can be reversed). */
async function unpublish(ref: ItemRef): Promise<string> {
  const data = { status: 'DRAFT' }
  switch (ref.type) {
    case 'software': await db.softwareTitle.update({ where: { id: ref.id }, data }); break
    case 'game': await db.gameTitle.update({ where: { id: ref.id }, data }); break
    case 'title': await db.cinemaTitle.update({ where: { id: ref.id }, data }); break
    case 'album': await db.musicAlbum.update({ where: { id: ref.id }, data }); break
    case 'track': await db.musicTrack.update({ where: { id: ref.id }, data }); break
    case 'post': await db.post.update({ where: { id: ref.id }, data }); break
    case 'product': await db.product.update({ where: { id: ref.id }, data: { active: false } }); break
    case 'thread': await db.forumThread.update({ where: { id: ref.id }, data: { status: 'HIDDEN' } }); break
    default: return ''
  }
  contentChanged(ref, null, null)
  return `${ITEM_LABEL[ref.type].one} #${ref.id} از دسترس خارج شد`
}

/**
 * Decides a report. ACCEPTED can unpublish whole items and/or disable single
 * download links; every action is appended to the internal log.
 */
export async function decideReport(id: number, input: { status: unknown; resolution: unknown; unpublish?: unknown; disableLinks?: unknown }, adminId: number) {
  const row = await db.copyrightReport.findUnique({ where: { id } })
  if (!row) throw new CopyrightError('گزارش پیدا نشد', 404)
  const status = (['REVIEWING', 'ACCEPTED', 'REJECTED'] as const).find((value) => value === input.status)
  if (!status) throw new CopyrightError('وضعیت نامعتبر است')
  const resolution = String(input.resolution ?? '').replace(/[<>]/g, ' ').trim().slice(0, 2000)
  if (status !== 'REVIEWING' && resolution.length < 5) throw new CopyrightError('پیامی برای گزارش‌دهنده بنویسید (نتیجهٔ بررسی)')
  const log: string[] = []
  if (status === 'ACCEPTED') {
    for (const raw of Array.isArray(input.unpublish) ? input.unpublish.slice(0, 20) : []) {
      const ref = parseItemKey(raw)
      const done = ref ? await unpublish(ref).catch(() => '') : ''
      if (done) log.push(done)
    }
    const linkIds = (Array.isArray(input.disableLinks) ? input.disableLinks : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200)
    if (linkIds.length) {
      const { count } = await db.mediaLink.updateMany({ where: { id: { in: linkIds } }, data: { disabled: true } })
      log.push(`${count.toLocaleString('fa-IR')} لینک دانلود غیرفعال شد`)
    }
  }
  const stamp = `[${new Date().toISOString().slice(0, 16).replace('T', ' ')} · admin #${adminId}] ${status}${log.length ? `: ${log.join('؛ ')}` : ''}`
  await db.copyrightReport.update({ where: { id }, data: {
    status, handledBy: adminId, ...(resolution ? { resolution } : {}),
    actionTaken: [row.actionTaken, stamp].filter(Boolean).join('\n').slice(-5000),
    resolvedAt: status === 'REVIEWING' ? null : new Date(),
  } })
  return { id, status, actions: log }
}
