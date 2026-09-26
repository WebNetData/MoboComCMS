import { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { getConnectionGuide, CONNECTION_GUIDE_KEY } from '@/modules/site/server/connection-guide'
import { validateConnectionGuide } from '@/modules/site/domain/connection-guide'
export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return ok(await getConnectionGuide())
}
export async function PATCH(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  try {
    const guide = validateConnectionGuide(await req.json())
    await db.setting.upsert({ where: { key: CONNECTION_GUIDE_KEY }, create: { key: CONNECTION_GUIDE_KEY, value: JSON.stringify(guide) }, update: { value: JSON.stringify(guide) } })
    return ok({ saved: true })
  } catch (error) { return err(error instanceof Error ? error.message : 'Invalid guide', 400) }
}
