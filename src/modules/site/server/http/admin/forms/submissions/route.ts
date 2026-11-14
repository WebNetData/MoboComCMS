import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin, auditAdminStrict } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { FormsError } from '@/modules/forms/domain/forms'
import { db } from '@/platform/database/prisma'
import { deleteSubmissions, exportCsv, formStats, listSubmissions, updateSubmissions } from '@/modules/forms/server/service'
import { assertOwnWork, eraseSecrets, revealSecrets, workOnSubmission } from '@/modules/forms/server/paid'
import { attachPaidServiceOrder } from '@/modules/forms/server/repair-invoice'
import { listForms } from '@/modules/forms/server/service'
import { assertMayHandleForm, assertMayHandleSubmission, editSubmission, formFieldStats, mayHandle } from '@/modules/forms/server/advanced'
import { receiptOf, staffSubmit } from '@/modules/forms/server/counter'
import { moduleGuard } from '@/extensions/server/modules'

/** Whoever builds forms, or whoever is given the answers to work on. */
const staff = async (req: NextRequest) => await requirePerm(req, 'cms.pages') || await requirePerm(req, 'forms.handle')
const mayAttachPaidServiceOrder = async (req: NextRequest) => Boolean(await requirePerm(req, 'orders.manage')) && !(await moduleGuard('store'))

const failure = (error: unknown) => { if (error instanceof FormsError) return err(error.message, error.status); throw error }
const ids = (body: Record<string, unknown>) => (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number)

/** GET ?formId=&status=&q=&from=&to=&page= — answers; &export=csv downloads them; &view=stats gives the daily chart. */
export async function GET(req: NextRequest) {
  const reader = await staff(req)
  if (!reader) return err('دسترسی مجاز نیست', 403)
  const builder = Boolean(await requirePerm(req, 'cms.pages'))
  const q = req.nextUrl.searchParams
  // ?receipt=ID&copy=shop|customer — a receipt to print; the shop's copy shows the device lock, so it is recorded.
  if (q.get('receipt')) {
    const id = Number(q.get('receipt')), copy = q.get('copy') === 'shop' ? 'shop' : 'customer'
    try {
      await assertMayHandleSubmission(id, reader, builder)
      const receipt = await receiptOf(id, copy)
      if (copy === 'shop') await auditAdmin({ req, actor: reader, action: 'forms.receipt_shop', targetType: 'form_submission', targetId: String(id), metadata: { secrets: receipt.secrets.length } })
      return ok(receipt)
    } catch (error) { return failure(error) }
  }
  const formId = Number(q.get('formId'))
  // formId=0 is the work queue: the answers of every form this member of staff may handle.
  if (formId === 0 && !q.get('view') && !q.get('export')) {
    const formIds = (await listForms()).filter((form) => mayHandle(form, reader, builder)).map((form) => form.id!)
    const rows = await listSubmissions({ formId: 0, formIds, viewer: builder ? undefined : reader.id, stage: q.get('stage') || '', status: q.get('status') || 'ALL', q: q.get('q') || '', page: Number(q.get('page')) || 1, mine: q.get('who') === 'mine' ? reader.id : undefined, unassigned: q.get('who') === 'free' })
    const canAttachPaidServiceOrder = await mayAttachPaidServiceOrder(req)
    return ok({ ...rows, rows: rows.rows.map((row) => ({ ...row, canAttachPaidServiceOrder })) })
  }
  if (!Number.isSafeInteger(formId) || formId < 1) return err('شناسه نامعتبر')
  const query = { formId, viewer: builder ? undefined : reader.id, mine: q.get('who') === 'mine' ? reader.id : undefined, unassigned: q.get('who') === 'free', stage: q.get('stage') || '', status: q.get('status') || 'ALL', q: q.get('q') || '', from: q.get('from') || '', to: q.get('to') || '', page: Number(q.get('page')) || 1 }
  try {
    await assertMayHandleForm(formId, reader, builder)
    if (q.get('view') === 'fields') return ok(await formFieldStats(formId, builder ? undefined : reader.id))
    if (q.get('view') === 'stats') return ok(await formStats(formId))
    if (q.get('export') === 'csv') {
      const file = await exportCsv(query)
      return new Response(file.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.slug}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } })
    }
    const rows = await listSubmissions(query)
    const canAttachPaidServiceOrder = await mayAttachPaidServiceOrder(req)
    return ok({ ...rows, rows: rows.rows.map((row) => ({ ...row, canAttachPaidServiceOrder })) })
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
    for (const id of (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0).slice(0, 200)) { await assertMayHandleSubmission(id, admin, builder); await assertOwnWork(id, admin, builder) }
    if (body.attachPaidServiceOrder === true) {
      const orderId = Number(body.orderId)
      if (!Number.isSafeInteger(orderId) || orderId <= 0) return err('شمارهٔ سفارش معتبر نیست')
      if (!await requirePerm(req, 'orders.manage')) return err('برای اتصال سفارش مختلط، دسترسی مدیریت سفارش‌ها لازم است', 403)
      const off = await moduleGuard('store')
      if (off) return off
      const attached = await db.$transaction(async (tx) => {
        if (!await requirePerm(req, 'orders.manage', tx)) throw new FormsError('دسترسی مدیریت سفارش‌ها تغییر کرده است', 403)
        const actor = { id: admin.id, builder: Boolean(await requirePerm(req, 'cms.pages', tx)), handler: Boolean(await requirePerm(req, 'forms.handle', tx)) }
        const result = await attachPaidServiceOrder(tx, one, orderId, actor)
        await auditAdminStrict({ req, actor: admin, action: 'forms.repair_order.attach', targetType: 'form_submission', targetId: String(one), metadata: { orderId } }, tx)
        return result
      })
      return ok(attached)
    }
    if (body.answers && typeof body.answers === 'object') {
      const edited = await editSubmission(one, body.answers)
      await auditAdmin({ req, actor: admin, action: 'forms.submission_edit', targetType: 'form_submission', targetId: String(one), metadata: { fields: edited.changed } })
      return ok(edited)
    }
    if (body.work && typeof body.work === 'object') {
      const work = await workOnSubmission(one, admin, body.work, builder)
      // A device handed back without the customer's code: who did it and why stays on record.
      if (work.overridden) await auditAdmin({ req, actor: admin, action: 'forms.pickup_override', targetType: 'form_submission', targetId: String(one), metadata: { reason: work.overridden } })
      // A repair handed back without its paid invoice (warranty, free work): who decided and why stays on record.
      if (work.withoutInvoice) await auditAdmin({ req, actor: admin, action: 'forms.pickup_without_invoice', targetType: 'form_submission', targetId: String(one), metadata: { reason: work.withoutInvoice } })
      return ok(work)
    }
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

/** POST { formId, values } — a customer in the shop, entered by staff on the desk (recorded). */
/** Staff entry of a customer in the shop: the in-store module's service intake (plugins/instore). Printing a receipt already taken stays open. */
export async function POST(req: NextRequest) {
  const off = await moduleGuard('instore')
  if (off) return off
  const admin = await staff(req)
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const body = await req.json().catch(() => null)
  const formId = Number(body?.formId)
  if (!Number.isSafeInteger(formId) || formId < 1) return err('شناسه نامعتبر')
  const builder = Boolean(await requirePerm(req, 'cms.pages'))
  try {
    await assertMayHandleForm(formId, admin, builder)
    const created = await staffSubmit(formId, { values: body.values }, admin)
    await auditAdmin({ req, actor: admin, action: 'forms.staff_entry', targetType: 'form_submission', targetId: String(created.id), metadata: { formId } })
    return ok(created)
  } catch (error) { return failure(error) }
}
