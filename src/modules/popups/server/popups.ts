import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import type { AuthedUser } from '@/modules/identity/server/access'
import { sectionsOf, SITE_SECTIONS } from '@/modules/identity/domain/sections'
import { ALL_PERMISSIONS } from '@/modules/identity/rbac'
import { viewerFor } from '@/modules/forum/server/community'
import { isDue, isLive, matchesAudience, normalizePopup, parseIds, type PopupViewer, type ServedPopup } from '@/modules/popups/domain/popups'

type Row = Awaited<ReturnType<typeof db.sitePopup.findMany>>[number]

// Every page view of every visitor asks for popups, and almost always there are none: the list of live popups is read rarely.
const CACHE_MS = 20_000
const g = globalThis as unknown as { __mobocomPopups?: { at: number; rows: Row[] } }
export const forgetLivePopups = () => { g.__mobocomPopups = undefined }

async function livePopups(now: Date) {
  const cached = g.__mobocomPopups
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.rows.filter((row) => isLive(row, now))
  const rows = await db.sitePopup.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ priority: 'desc' }, { id: 'desc' }], take: 50 })
  g.__mobocomPopups = { at: now.getTime(), rows }
  return rows.filter((row) => isLive(row, now))
}

const ruleOf = (row: Row) => ({ audience: row.audience, groupIds: parseIds<number>(row.groupIds), sections: parseIds<string>(row.sections) })

/** Who is looking: staff by their current role, groups through the forum's own rule for membership. */
async function viewerOf(user: AuthedUser | null, rows: Row[]): Promise<PopupViewer> {
  const staff = user?.role === 'ADMIN'
  const permissions = staff ? (user.permissions?.length ? user.permissions : ALL_PERMISSIONS) : []
  const needsGroups = rows.some((row) => row.audience === 'GROUPS')
  return { signedIn: Boolean(user), staff, sections: sectionsOf(permissions), groupIds: needsGroups ? (await viewerFor(user?.id ?? null)).groupIds : [] }
}

const serve = (row: Row): ServedPopup => ({
  id: row.id, revision: row.revision, title: row.title, body: row.body, kind: row.kind, design: row.design, effect: row.effect, position: row.position, image: row.image,
  actionLabel: row.actionLabel, actionUrl: row.actionUrl, closeLabel: row.closeLabel, mustConfirm: row.mustConfirm,
  repeatHours: row.repeatHours, maxViews: row.maxViews, delaySeconds: row.delaySeconds, pages: row.pages, audience: row.audience as ServedPopup['audience'],
})

/** The popups this viewer may see now. For a member the count is here; a guest's is kept by their browser. */
export async function popupsFor(user: AuthedUser | null, now = new Date()) {
  const live = await livePopups(now)
  if (!live.length) return []
  const viewer = await viewerOf(user, live)
  const rows = live.filter((row) => matchesAudience(ruleOf(row), viewer))
  if (!user || !rows.length) return rows.slice(0, 5).map(serve)
  const seen = await db.sitePopupSeen.findMany({ where: { userId: user.id, popupId: { in: rows.map((row) => row.id) } } })
  const counts = new Map(seen.map((row) => [row.popupId, { views: row.views, lastAt: row.lastAt.getTime() }]))
  return rows.filter((row) => isDue(row, counts.get(row.id), now.getTime())).slice(0, 5).map(serve)
}

/**
 * Counts one showing. For a member the claim is on the row, so two tabs opening together count once and the
 * total can never pass its limit. A guest only adds to the popup's own counter.
 */
export async function recordSeen(id: number, user: AuthedUser | null, now = new Date()) {
  const rows = await livePopups(now)
  const row = rows.find((item) => item.id === id)
  if (!row || !matchesAudience(ruleOf(row), await viewerOf(user, [row]))) return false
  if (!user) { await db.sitePopup.updateMany({ where: { id }, data: { guestViews: { increment: 1 } } }); return true }
  const seen = await db.sitePopupSeen.findUnique({ where: { popupId_userId: { popupId: id, userId: user.id } } })
  if (!seen) return db.sitePopupSeen.create({ data: { popupId: id, userId: user.id, views: 1, lastAt: now } }).then(() => true, () => false)
  if (!isDue(row, { views: seen.views, lastAt: seen.lastAt.getTime() }, now.getTime())) return false
  const claimed = await db.sitePopupSeen.updateMany({ where: { id: seen.id, views: seen.views }, data: { views: { increment: 1 }, lastAt: now } })
  return claimed.count === 1
}

export async function recordClick(id: number, user: AuthedUser | null) {
  await db.sitePopup.updateMany({ where: { id }, data: { clicks: { increment: 1 } } })
  if (user) await db.sitePopupSeen.updateMany({ where: { popupId: id, userId: user.id }, data: { clicked: true } })
}

// ------------------------------------------------------------------ admin

export async function adminPopups() {
  const [rows, totals, groups] = await Promise.all([
    db.sitePopup.findMany({ orderBy: [{ updatedAt: 'desc' }] }),
    db.sitePopupSeen.groupBy({ by: ['popupId'], _sum: { views: true }, _count: { _all: true } }),
    // Clubs are members' own groups; a notice is written for the site's groups.
    db.forumGroup.findMany({ where: { clubCategoryId: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, memberCount: true, automatic: true } }),
  ])
  const sum = new Map(totals.map((row) => [row.popupId, row]))
  return {
    groups, sections: SITE_SECTIONS.map((section) => ({ id: section.id, label: section.label })),
    popups: rows.map((row) => ({
      ...row, groupIds: parseIds<number>(row.groupIds), sections: parseIds<string>(row.sections),
      memberViews: sum.get(row.id)?._sum.views ?? 0, people: sum.get(row.id)?._count._all ?? 0,
    })),
  }
}

export async function savePopup(raw: Record<string, unknown>, actorId: number) {
  const data = normalizePopup(raw, SITE_SECTIONS.map((section) => section.id))
  const fields = { ...data, groupIds: JSON.stringify(data.groupIds), sections: JSON.stringify(data.sections) }
  const id = Number(raw.id) || 0
  const saved = id ? await db.sitePopup.update({ where: { id }, data: fields }) : await db.sitePopup.create({ data: { ...fields, createdBy: actorId } })
  forgetLivePopups()
  logEvent('info', 'popups.saved', { id: saved.id, status: saved.status })
  return saved
}

export async function setPopupStatus(id: number, status: 'ACTIVE' | 'PAUSED' | 'DRAFT') {
  const changed = await db.sitePopup.updateMany({ where: { id }, data: { status } })
  forgetLivePopups()
  return changed.count === 1
}

/** Everyone sees it afresh: the counts start again, and the new revision clears what guests' browsers remember. */
export async function restartPopup(id: number) {
  await db.$transaction([
    db.sitePopupSeen.deleteMany({ where: { popupId: id } }),
    db.sitePopup.updateMany({ where: { id }, data: { revision: { increment: 1 }, guestViews: 0, clicks: 0 } }),
  ])
  forgetLivePopups()
}

export async function deletePopup(id: number) {
  const removed = await db.sitePopup.deleteMany({ where: { id } })
  forgetLivePopups()
  return removed.count === 1
}
