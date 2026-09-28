import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { getTrustSeals, saveTrustSeals } from '@/modules/site/config/store'
import { SEAL_LABELS, parseSealCode } from '@/modules/site/config/trust-seals'

/** GET /api/admin/trust-seals */
export async function GET_seals(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  return ok({ config: await getTrustSeals(), labels: SEAL_LABELS })
}

/** PUT { config } saves the list; POST { code } reads an issuer's embed code without saving. */
export async function PUT_seals(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const config = await saveTrustSeals(body?.config)
  await auditAdmin({ req, actor: admin, action: 'trust_seals.update', targetType: 'setting', targetId: 'site.trust-seals.v1', metadata: { enabled: config.enabled, seals: config.seals.map((seal) => `${seal.kind}:${seal.enabled ? 'on' : 'off'}`) } })
  return ok({ config })
}

export async function POST_parse(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const seal = parseSealCode(body?.code)
  if (!seal) return err('در این کد نشانی تصویر نماد (src با https) پیدا نشد. کد کامل را از پنل صادرکننده کپی کنید.', 422)
  return ok({ seal: { ...seal, title: SEAL_LABELS[seal.kind] } })
}
