import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('دسترسی مجاز نیست', 403)
  const formId = Number(req.nextUrl.searchParams.get('formId'))
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1)
  if (!Number.isSafeInteger(formId) || formId < 1 || !Number.isSafeInteger(page)) return err('شناسه نامعتبر')
  const [rows, total] = await Promise.all([db.formSubmission.findMany({ where: { formId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 }), db.formSubmission.count({ where: { formId } })])
  return ok({ rows: rows.map(r => ({ ...r, data: JSON.parse(r.data) })), total, page })
}
export async function PATCH(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('دسترسی مجاز نیست', 403)
  const b = await req.json().catch(() => null)
  if (!Number.isSafeInteger(b?.id) || typeof b.read !== 'boolean') return err('داده نامعتبر')
  const result = await db.formSubmission.updateMany({ where: { id: b.id }, data: { read: b.read } })
  return result.count ? ok({ saved: true }) : err('پاسخ پیدا نشد', 404)
}
