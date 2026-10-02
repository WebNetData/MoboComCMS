import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { auditAdmin } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'
import { adminStudios, updateStudio } from '@/modules/studios/server/admin'

// A shared profile can affect both catalogues, so a single-section editor cannot modify it.
const guard = (req: NextRequest) => adminGuard(req, null, ['cms.posts'])

export async function GET(req: NextRequest) {
  const access = await guard(req)
  if ('response' in access) return access.response
  return ok(await adminStudios({ q: req.nextUrl.searchParams.get('q') || '', page: Number(req.nextUrl.searchParams.get('page')) || 1 }))
}

export async function PATCH(req: NextRequest) {
  const access = await guard(req)
  if ('response' in access) return access.response
  const input = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!input) return err('داده نامعتبر است')
  try {
    const studio = await updateStudio(Number(input.id), input)
    await auditAdmin({ req, actor: access.admin, action: 'studio.update', targetType: 'studio', targetId: studio.id, metadata: { name: studio.name } })
    return ok(studio)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'خطا در ذخیره', /not found/i.test(String(error)) ? 404 : 400)
  }
}
