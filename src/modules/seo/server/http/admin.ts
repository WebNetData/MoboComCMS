import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import sitemap from '@/modules/site/server/pages/sitemap'
import { getSeoConfig, saveSeoConfig } from '@/modules/seo/server/config'
import { runSeoAudit } from '@/modules/seo/server/audit'
import { submitIndexNow } from '@/modules/seo/server/indexnow'

const guard = (req: NextRequest) => requirePerm(req, 'settings.manage')

export async function GET(req: NextRequest) {
  if (!await guard(req)) return err('forbidden', 403)
  const [config, audit] = await Promise.all([getSeoConfig(), runSeoAudit()])
  return ok({ config, audit })
}

export async function PUT(req: NextRequest) {
  const admin = await guard(req)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('invalid body')
  const config = await saveSeoConfig(body)
  await auditAdmin({ req, actor: admin, action: 'seo.config.update', targetType: 'setting', targetId: 'seo.config.v1' })
  return ok({ config })
}

/** POST { action: 'submit-all' } sends every sitemap URL to IndexNow; { action: 'submit', urls } a list. */
export async function POST(req: NextRequest) {
  const admin = await guard(req)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const urls = body?.action === 'submit-all'
    ? (await sitemap()).map((entry) => entry.url)
    : Array.isArray(body?.urls) ? body.urls.filter((url: unknown) => typeof url === 'string').slice(0, 1000) : []
  if (!urls.length) return err('no urls to submit')
  const entry = await submitIndexNow(urls, { force: true })
  if (!entry) return err('IndexNow فقط روی سایتی با نشانی https واقعی کار می‌کند (نشانی سایت را در تنظیمات بررسی کنید)', 400)
  await auditAdmin({ req, actor: admin, action: 'seo.indexnow.submit', targetType: 'seo', targetId: 'indexnow', metadata: { count: entry.count, status: entry.status } })
  return ok({ entry })
}
