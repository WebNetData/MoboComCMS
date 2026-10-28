import { NextRequest } from 'next/server'
import { err } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { readUpload } from '@/modules/forms/server/service'
import { assertMayHandleForm, assertMayHandleSubmission } from '@/modules/forms/server/advanced'
import { FormsError } from '@/modules/forms/domain/forms'

/** GET ?id=<stored name> — an attachment of a submission, for those who build forms and those who handle that form's answers. */
export async function GET(req: NextRequest) {
  const builder = await requirePerm(req, 'cms.pages')
  const reader = builder || await requirePerm(req, 'forms.handle')
  if (!reader) return err('دسترسی مجاز نیست', 403)
  const file = await readUpload(req.nextUrl.searchParams.get('id') || '')
  if (!file) return err('فایل پیدا نشد', 404)
  // A file of an answer a colleague has taken is theirs, like its answers.
  try { await assertMayHandleForm(file.formId, reader, Boolean(builder)); if (file.submissionId) await assertMayHandleSubmission(file.submissionId, reader, Boolean(builder)) } catch (error) { if (error instanceof FormsError) return err(error.message, error.status); throw error }
  const inline = file.type !== 'application/pdf' || req.nextUrl.searchParams.get('download') !== '1'
  return new Response(new Uint8Array(file.bytes), { headers: {
    'Content-Type': file.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Content-Security-Policy': "default-src 'none'; sandbox",
  } })
}
