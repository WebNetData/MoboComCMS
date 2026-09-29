import { NextRequest } from 'next/server'
import { err } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { readUpload } from '@/modules/forms/server/service'

/** GET ?id=<stored name> — an attachment of a submission, for administrators only. */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.pages')) return err('دسترسی مجاز نیست', 403)
  const file = await readUpload(req.nextUrl.searchParams.get('id') || '')
  if (!file) return err('فایل پیدا نشد', 404)
  const inline = file.type !== 'application/pdf' || req.nextUrl.searchParams.get('download') !== '1'
  return new Response(new Uint8Array(file.bytes), { headers: {
    'Content-Type': file.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Content-Security-Policy': "default-src 'none'; sandbox",
  } })
}
