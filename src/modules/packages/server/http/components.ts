import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getPackageComponents } from '../components'

const BUILDERS = ['cms.pages', 'cms.posts', 'cms.products', 'settings.manage'] as const

/** Read-only: components enabled packages offer, for the builder picker and the library page. */
export async function GET(req: NextRequest) {
  let actor = null
  for (const perm of BUILDERS) { actor = await requirePerm(req, perm); if (actor) break }
  if (!actor) return err('دسترسی مجاز نیست', 403)
  try {
    const locale = req.nextUrl.searchParams.get('locale') === 'en' ? 'en' : 'fa'
    const response = ok({ components: await getPackageComponents(locale) })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch { return err('کامپوننت‌های افزونه‌ها در دسترس نیست', 503) }
}
