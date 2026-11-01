import type { NextRequest } from 'next/server'
import { requireUser } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { PromptError } from '../domain/prompts'
import { generatePrompt } from './generation'
import { memberGeneration, memberHistory, templateDirectory, templateForAdmin, policy } from './queries'
import { changeHistory, deleteTemplate, restoreTemplate, saveTemplate } from './commands'
import { positiveId, templateScope } from './transaction'

const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers })
function sameOrigin(req: NextRequest) {
  const configured = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null
  return mutationOrigin({ origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'), referer: req.headers.get('referer'), hasCookies: true, hosts: [req.headers.get('host'), configured] }) === 'allow'
}
function failure(error: unknown) {
  if (error instanceof PromptError || error instanceof JsonBodyError) return reply({ error: error.message }, error.status)
  console.error('[prompts] request failed')
  return reply({ error: 'عملیات انجام نشد؛ دوباره تلاش کنید' }, 500)
}
export async function POST_generate(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: 'درخواست باید از همین سایت ارسال شود' }, 403)
  try { return reply(await generatePrompt(req, await readJsonObject(req, 131072))) } catch (error) { return failure(error) }
}
export async function GET_history(req: NextRequest) {
  const actor = await requireUser(req)
  if (!actor) return reply({ error: 'برای دیدن تاریخچه وارد حساب شوید' }, 401)
  try { return reply(req.nextUrl.searchParams.has('id') ? { item: await memberGeneration(actor.id, positiveId(req.nextUrl.searchParams.get('id'))) } : await memberHistory(actor.id, Object.fromEntries(req.nextUrl.searchParams))) } catch (error) { return failure(error) }
}
export async function POST_history(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: 'درخواست باید از همین سایت ارسال شود' }, 403)
  try { return reply(await changeHistory(req, await readJsonObject(req, 131072))) } catch (error) { return failure(error) }
}
export async function GET_admin(req: NextRequest) {
  try {
    const scope = await templateScope(req), settings = await policy()
    if (req.nextUrl.searchParams.has('id')) return reply({ template: await templateForAdmin(positiveId(req.nextUrl.searchParams.get('id')), scope.authorId) })
    return reply({ ...await templateDirectory(Object.fromEntries(req.nextUrl.searchParams), true, scope.authorId), mine: !!scope.authorId, reviewAuthors: settings.reviewAuthors, canManage: scope.authorId === null, canTeam: scope.admin.roleId == null || hasPermission(scope.admin.permissions || [], 'roles.manage'), canConfigure: scope.admin.roleId == null || hasPermission(scope.admin.permissions || [], 'settings.manage') })
  } catch (error) { return failure(error) }
}
export async function POST_admin(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: 'درخواست باید از همین سایت ارسال شود' }, 403)
  try {
    await templateScope(req)
    const raw = await readJsonObject(req, 131072)
    if (raw.action === 'save') return reply({ template: await saveTemplate(req, raw) })
    if (raw.action === 'delete') return reply(await deleteTemplate(req, raw))
    if (raw.action === 'restore') return reply(await restoreTemplate(req, raw))
    throw new PromptError('عملیات معتبر نیست')
  } catch (error) { return failure(error) }
}
