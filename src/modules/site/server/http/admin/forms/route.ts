import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { FormsError } from '@/modules/forms/domain/forms'
import { deleteForm, duplicateForm, listForms, saveForm, templateList } from '@/modules/forms/server/service'

const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
const failure = (error: unknown) => { if (error instanceof FormsError) return err(error.message, error.status); throw error }

/** GET /api/admin/forms → { forms, templates } */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('دسترسی مجاز نیست', 403)
  const forms = await listForms()
  // Older clients read the bare list.
  if (req.nextUrl.searchParams.get('legacy') === '1') return ok(forms)
  return ok({ forms, templates: templateList() })
}

/** POST /api/admin/forms — a form to save, or { op: 'duplicate' | 'delete', id }. */
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'cms.pages')
  if (!admin) return err('دسترسی مجاز نیست', 403)
  const raw = await req.text()
  if (raw.length > 200_000) return err('فرم بیش از حد بزرگ است', 413)
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return err('داده نامعتبر') }
  const audit = (action: string, id: string | number) => auditAdmin({ req, actor: admin, action: `forms.${action}`, targetType: 'form', targetId: String(id), metadata: {} })
  try {
    if (body.op === 'duplicate') { const copy = await duplicateForm(idOf(body.id)); await audit('duplicate', copy.id!); return ok(copy) }
    if (body.op === 'delete') { await deleteForm(idOf(body.id)); await audit('delete', idOf(body.id)); return ok({ ok: true }) }
    const saved = await saveForm(body)
    await audit('save', saved.id!)
    return ok(saved)
  } catch (error) { return failure(error) }
}
