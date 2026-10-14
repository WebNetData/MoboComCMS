import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { FormsError } from '@/modules/forms/domain/forms'
import { deleteSubmissions, exportCsv, formStats, listSubmissions, updateSubmissions } from '@/modules/forms/server/service'
import { eraseSecrets, revealSecrets, workOnSubmission } from '@/modules/forms/server/paid'
import { assertMayHandleForm, assertMayHandleSubmission, editSubmission, formFieldStats } from '@/modules/forms/server/advanced'

/** Whoever builds forms, or whoever is given the answers to work on. */
const staff = async (req: NextRequest) => await requirePerm(req, 'cms.pages') || await requirePerm(req, 'forms.handle')

const failure = (error: unknown) => { if (error instanceof FormsError) return err(error.message, error.status); throw error }
const ids = (body: Record<string, unknown>) => (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number)

/** GET ?formId=&status=&q=&from=&to=&page= — answers; &export=csv downloads them; &view=stats gives the daily chart. */
export async function GET(req: NextRequest) {
  const reader = await staff(req)
  if (!reader) return err('دسترسی مجاز نیست', 403)
  const builder = Boolean(await requirePerm(req, 'cms.pages'))
  const q = req.nextUrl.searchParams
  const formId = Number(q.get('formId'))
  if (!Number.isSafeInteger(formId) || formId < 1) return err('شناسه نامعتبر')
  const query = { formId, stage: q.get('stage') || '', status: q.get('status') || 'ALL', q: q.get('q') || '', from: q.get('from') || '', to: q.get('to') || '', page: Number(q.get('page')) || 1 }
  try {
    await assertMayHandleForm(formId, reader, builder)
    if (q.get('view') === 'fields') return ok(await formFieldStats(formId))
    if (q.get('view') === 'stats') return ok(await formStats(formId))
    if (q.get('export') === 'csv') {
      const file = await exportCsv(query)
      return new Response(file.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.slug}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } })
    }
    return ok(await listSubmissions(query))
  } catch (error) { return failure(error) }
}

/**
 * PATCH { id | ids, status?, note? } (a legacy { id, read } still works)
 *   { id, work: { stage?, take?, reply? } } — the work on one answer
 *   { id, secrets: 'reveal' | 'erase' } — a sender's passwords (reading them is recorded)
 *   { id, answers: { fieldId: value } } — staff correct plain answers (recorded)
 */
export async function PATCH(req: NextRequest) {
  const admin = await staff(req)
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('داده نامعتبر')
  const one = Number(body.id)
  const builder = Boolean(await requirePerm(req, 'cms.pages'))
  try {
    // A form given to named handlers is theirs alone to work on.
    for (const id of (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0).slice(0, 200)) await assertMayHandleSubmission(id, admin, builder)
    if (body.answers && typeof body.answers === 'object') {
      const edited = await editSubmission(one, body.answers)
      await auditAdmin({ req, actor: admin, action: 'forms.submission_edit', targetType: 'form_submission', targetId: String(one), metadata: { fields: edited.changed } })
      return ok(edited)
    }
    if (body.work && typeof body.work === 'object') return ok(await workOnSubmission(one, admin, body.work))
    if (body.secrets === 'reveal') {
      const secrets = await revealSecrets(one)
      await auditAdmin({ req, actor: admin, action: 'forms.secrets_reveal', targetType: 'form_submission', targetId: String(one), metadata: { fields: secrets.map((secret) => secret.id) } })
      return ok({ secrets })
    }
    if (body.secrets === 'erase') {
      await eraseSecrets(one)
      await auditAdmin({ req, actor: admin, action: 'forms.secrets_erase', targetType: 'form_submission', targetId: String(one), metadata: {} })
      return ok({ erased: true })
    }
  } catch (error) { return failure(error) }
  const status = body.status !== undefined ? body.status : typeof body.read === 'boolean' ? (body.read ? 'READ' : 'NEW') : undefined
  try {
    const changed = await updateSubmissions(ids(body), { status, note: body.note })
    return ok({ saved: true, changed })
  } catch (error) { return failure(error) }
}

/** DELETE { ids } */
export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'cms.pages')
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('داده نامعتبر')
  try {
    const removed = await deleteSubmissions(ids(body))
    await auditAdmin({ req, actor: admin, action: 'forms.submissions.delete', targetType: 'form', targetId: String(body.formId || ''), metadata: { removed } })
    return ok({ removed })
  } catch (error) { return failure(error) }
}
