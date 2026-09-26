import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { validateSubmission, type FormField } from '@/modules/site/config/forms'

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin && origin !== process.env.NEXTAUTH_URL) return err('درخواست غیرمجاز', 403)
  if (!rateLimitHit(`form:${params.slug}:${clientIp(req.headers)}`, 5, 60_000).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const raw = await req.text()
  if (raw.length > 32000) return err('اطلاعات بیش از حد بزرگ است', 413)
  let b: any
  try { b = JSON.parse(raw) } catch { return err('داده نامعتبر') }
  if (b?.website) return ok({ message: 'پیام شما ثبت شد.' })
  const form = await db.siteForm.findUnique({ where: { slug: params.slug } })
  if (!form?.published) return err('فرم در دسترس نیست', 404)
  try {
    const fields = JSON.parse(form.fields) as FormField[]
    const values = validateSubmission(fields, b?.values)
    // Store labels with answers so future form edits cannot erase their meaning.
    const data = fields.map(f => ({ id: f.id, label: f.label, value: values[f.id] }))
    await db.formSubmission.create({ data: { formId: form.id, data: JSON.stringify(data) } })
    return ok({ message: form.successText }, 201)
  } catch (e) { return err(e instanceof Error ? e.message : 'ثبت پاسخ ممکن نشد') }
}
