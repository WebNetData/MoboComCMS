import { moduleGuard } from '@/extensions/server/modules'
import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { ACTIONS, AutomationError, OPS, OP_LABEL, RECIPES, TRIGGERS } from '@/modules/automation/domain/automation'
import { deleteRule, listRules, previewRule, recentRuns, saveRule, triggerAvailable } from '@/modules/automation/server/engine'
import { isModuleEnabled } from '@/extensions/server/modules'
import { db } from '@/platform/database/prisma'

const failure = (error: unknown) => { if (error instanceof AutomationError) return err(error.message, error.status); throw error }

/** GET /api/admin/automation — the rules, what a rule can be built from, ready-made rules and the latest runs. */
export async function GET(req: NextRequest) {
  const disabled = await moduleGuard('automation'); if (disabled) return disabled
  if (!await requirePerm(req, 'automation.manage')) return err('دسترسی مجاز نیست', 403)
  const ruleId = Number(req.nextUrl.searchParams.get('runs')) || undefined
  if (ruleId) return ok({ runs: await recentRuns(ruleId, 100) })
  const reviewWhere = { dedupeKey: null, processedAt: null, needsReviewAt: { not: null } }
  const [rules, runs, reviewCount, reviewRows] = await Promise.all([
    listRules(),
    recentRuns(undefined, 40),
    db.automationEvent.count({ where: reviewWhere }),
    db.automationEvent.findMany({
      where: reviewWhere, orderBy: [{ needsReviewAt: 'desc' }, { id: 'desc' }], take: 20,
      select: { id: true, name: true, needsReviewAt: true, processingError: true },
    }),
  ])
  const available = new Set((await Promise.all(TRIGGERS.map(async trigger => await triggerAvailable(trigger.id) ? trigger.id : null))).filter(Boolean))
  const formsOn = await isModuleEnabled('forms')
  const response = ok({ rules, runs, recovery: { needsReview: reviewCount, recent: reviewRows }, triggers: TRIGGERS.filter(trigger => available.has(trigger.id)), actions: ACTIONS.filter(action => formsOn || !['assign_form', 'set_form_stage'].includes(action.id)), ops: OPS.map((op) => ({ id: op, label: OP_LABEL[op] })), recipes: RECIPES.filter(recipe => available.has(recipe.rule.trigger)) })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** POST — a rule to save; { op: 'delete' | 'toggle', id }; { op: 'preview', rule } shows what it would find now, without doing it. */
export async function POST(req: NextRequest) {
  const disabled = await moduleGuard('automation'); if (disabled) return disabled
  const admin = await requirePerm(req, 'automation.manage')
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('داده نامعتبر')
  try {
    if (body.op === 'preview') return ok(await previewRule(body.rule))
    if (body.op === 'delete') {
      await deleteRule(Number(body.id))
      await auditAdmin({ req, actor: admin, action: 'automation.delete', targetType: 'automation_rule', targetId: String(body.id), metadata: {} })
      return ok({ deleted: true })
    }
    if (body.op === 'toggle') {
      const rule = (await listRules()).find((item) => item.id === Number(body.id))
      if (!rule) return err('قانون پیدا نشد', 404)
      const saved = await saveRule({ ...rule, enabled: !rule.enabled })
      await auditAdmin({ req, actor: admin, action: saved.enabled ? 'automation.enable' : 'automation.disable', targetType: 'automation_rule', targetId: String(saved.id), metadata: {} })
      return ok(saved)
    }
    const saved = await saveRule(body)
    await auditAdmin({ req, actor: admin, action: 'automation.save', targetType: 'automation_rule', targetId: String(saved.id), metadata: { trigger: saved.trigger, actions: saved.actions.map((action) => action.type) } })
    return ok(saved)
  } catch (error) { return failure(error) }
}
