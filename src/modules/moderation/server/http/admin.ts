import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requireAdmin } from '@/modules/identity/server/access'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { hasPermission } from '@/modules/identity/rbac'
import { getModuleStates } from '@/extensions/server/modules'
import { visibleSources, type QueueSourceKey } from '@/modules/moderation/domain/queue'
import { CASE_ACTIONS, isQueueSource, type CaseAction } from '@/modules/moderation/domain/cases'
import { moderationQueue } from '@/modules/moderation/server/queue'
import { CaseError, casesFor, claimCase, myOpenCases, noteCase, recentDecisions, recordDecision, releaseCase } from '@/modules/moderation/server/cases'

/** The staff member and the sources they may moderate: the owning module is on and they hold one of its permissions. */
async function staff(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return null
  // Same rule as requirePerm: an administrator without a role is unrestricted.
  const permissions = admin.permissions
  const can = (permission: string) => !permissions || permissions.length === 0 ? admin.roleId == null : hasPermission(permissions, permission)
  const states = await getModuleStates()
  const sources = visibleSources(states, can).map((source) => source.key)
  return sources.length ? { admin, can, states, sources } : null
}

/** GET /api/admin/moderation — what waits for a staff decision, limited to what this staff member may moderate, with the staff work around each item. */
export async function GET(req: NextRequest) {
  const who = await staff(req)
  if (!who) return err('forbidden', 403)
  const queue = await moderationQueue(who.states, who.can)
  const cases = await Promise.all(queue.groups.map((group) => casesFor(group.key, group.items.map((item) => item.id), who.admin.id).catch(() => new Map())))
  const [decided, mine] = await Promise.all([recentDecisions(who.sources).catch(() => []), myOpenCases(who.admin.id, who.sources).catch(() => [])])
  const response = ok({ ...queue, groups: queue.groups.map((group, index) => ({ ...group, items: group.items.map((item) => ({ ...item, case: cases[index].get(item.id) || null })) })), decided, mine })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/**
 * POST /api/admin/moderation { action: claim | release | note | decided, source, id, note?, decision?, takeOver? }
 * The staff work around an item: taking it, letting go, a note for colleagues, and the record of a decision
 * the owning module has just accepted. It decides nothing itself.
 */
export async function POST(req: NextRequest) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const who = await staff(req)
  if (!who) return err('forbidden', 403)
  let body: Record<string, unknown>
  try { body = await readJsonObject(req, 8192) } catch { return err('درخواست نامعتبر است', 422) }
  const action = body.action as CaseAction, id = Number(body.id)
  if (!(CASE_ACTIONS as readonly string[]).includes(action) || !Number.isSafeInteger(id) || id <= 0) return err('درخواست نامعتبر است', 400)
  // A source this staff member may not moderate does not exist for them.
  if (!isQueueSource(body.source, who.sources)) return err('forbidden', 403)
  const source: QueueSourceKey = body.source
  const round = body.round === undefined ? 1 : Number(body.round)
  if (!Number.isSafeInteger(round) || round < 1) return err('دور بررسی معتبر نیست', 422)
  try {
    const result = action === 'claim' ? await claimCase(source, id, who.admin.id, body.takeOver === true, new Date(), round)
      : action === 'release' ? await releaseCase(source, id, who.admin.id, round)
      : action === 'note' ? await noteCase(source, id, body.note, round)
      : await recordDecision(source, id, who.admin.id, body.decision, round)
    if (action !== 'decided') await auditAdmin({ req, actor: who.admin, action: `moderation.case.${action}`, targetType: source, targetId: id, metadata: action === 'claim' && body.takeOver === true ? { takeOver: true } : undefined })
    return ok(result)
  } catch (error) {
    if (error instanceof CaseError) return err(error.message, error.status)
    console.error('[moderation.cases]', error)
    return err('خطای داخلی؛ دوباره تلاش کنید', 500)
  }
}
