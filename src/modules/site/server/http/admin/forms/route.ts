import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { validForm } from '@/modules/site/config/forms'
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('دسترسی مجاز نیست', 403)
  const forms = await db.siteForm.findMany({ orderBy: { updatedAt: 'desc' }, include: { _count: { select: { submissions: true } } } })
  return ok(forms.map(f => ({ ...f, fields: JSON.parse(f.fields) })))
}
export async function POST(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('دسترسی مجاز نیست', 403)
  const raw = await req.text()
  if (raw.length > 50000) return err('فرم بیش از حد بزرگ است', 413)
  let b: unknown
  try { b = JSON.parse(raw) } catch { return err('داده نامعتبر') }
  if (!validForm(b)) return err('عنوان، نشانی یا فیلدهای فرم را بررسی کنید')
  if (b.id !== undefined && (!Number.isSafeInteger(b.id) || b.id <= 0)) return err('شناسه نامعتبر')
  const data = { slug: b.slug, title: b.title, description: b.description, fields: JSON.stringify(b.fields), published: b.published, successText: b.successText }
  try {
    const form = b.id ? await db.siteForm.update({ where: { id: b.id }, data }) : await db.siteForm.create({ data })
    return ok({ ...form, fields: JSON.parse(form.fields) })
  } catch (e: any) { return err(e.code === 'P2002' ? 'این نشانی قبلاً استفاده شده است' : 'ذخیره فرم ممکن نشد') }
}
