import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { db } from '@/platform/database/prisma'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const [activePanels, panelLinks, encryptedLinks] = await Promise.all([
    db.panel.count({ where: { active: true } }),
    db.subscription.count({ where: { panelSubUrl: { not: '' } } }),
    db.setting.count({ where: { key: { startsWith: 'happ.crypt5.' } } }),
  ])
  return ok({
    ready: activePanels > 0,
    activePanels,
    panelLinks,
    encryptedLinks,
    format: 'happ://crypt5/',
    encryptionService: 'crypto.happ.su',
    subscriptionSource: 'VPN Panel',
    shopDomainUsed: false,
    rawExport: false,
  })
}
