import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { FILE_NAME, SECTIONS } from '@/modules/watermark/domain/watermark'
import { getWatermark, listImages, markImage, previewWatermark, saveWatermark, usageIndex, watermarkFontReady } from '@/modules/watermark/server/watermark'

/** GET /api/admin/watermark — settings and what the page needs. */
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const [settings, index, font] = await Promise.all([getWatermark(), usageIndex(), watermarkFontReady()])
  return ok({ settings, sections: SECTIONS, indexed: index.size, font })
}

/** PATCH /api/admin/watermark { ...settings } */
export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) || {}
  const saved = await saveWatermark(body)
  await auditAdmin({ req, actor: admin, action: 'watermark.update', targetType: 'setting', targetId: 'media.watermark.v1', metadata: { enabled: saved.enabled, scope: saved.scope, position: saved.position } })
  return ok({ settings: saved })
}

/** POST /api/admin/watermark { action: preview | images | mark | reindex, … } */
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.action === 'preview') return ok({ image: await previewWatermark(body.settings || {}, body.file) })
    if (body.action === 'images') return ok(await listImages(body))
    if (body.action === 'reindex') return ok({ indexed: (await usageIndex(true)).size })
    if (body.action === 'mark') {
      const file = String(body.file || '')
      if (!FILE_NAME.test(file) || !['include', 'exclude', 'default'].includes(body.choice)) return err('درخواست نامعتبر است')
      await markImage(file, body.choice)
      await auditAdmin({ req, actor: admin, action: 'watermark.image', targetType: 'image', targetId: file, metadata: { choice: body.choice } })
      return ok({ settings: await getWatermark() })
    }
    return err('عملیات نامعتبر است')
  } catch (error) {
    console.error('[watermark]', error)
    return err('انجام نشد؛ دوباره تلاش کنید', 500)
  }
}
