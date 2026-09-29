import type { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { authSecret } from '@/platform/config/env'
import { moduleGuard } from '@/extensions/server/modules'
import { getRawToken } from '@/modules/identity/server/access'
import { RepoError } from '@/modules/repository/domain/repository'
import {
  activateLicense, buyProduct, checkLicense, deactivateLicense, downloadForOwner, downloadRelease, getVendorConfig, licensesOf, publicCatalog, publicMeta, publicProduct, releaseSite,
} from '@/modules/repository/server/vendor'

/** Public side of the repository: what other sites (and buyers) talk to. It exists only when the vendor role is switched on. */

const failure = (error: unknown) => { if (error instanceof RepoError) return err(error.message, error.status, error.meta); throw error }
const ipHash = (req: NextRequest) => createHash('sha256').update(`${authSecret()}:repo:${clientIp(req.headers)}`).digest('hex').slice(0, 16)
const userIdOf = async (req: NextRequest) => { const token = await getRawToken(req).catch(() => null); const id = Number(token?.uid); return Number.isSafeInteger(id) && id > 0 ? id : null }

async function vendorGate(req: NextRequest, limit = 120) {
  const off = await moduleGuard('repository')
  if (off) return off
  if (!(await getVendorConfig()).enabled) return err('not found', 404)
  if (!rateLimitHit(`repo:${clientIp(req.headers)}`, limit, 60_000).ok) return err('too many requests', 429)
  return null
}

export async function GET_meta(req: NextRequest) { const blocked = await vendorGate(req); return blocked || ok(await publicMeta()) }

export async function GET_catalog(req: NextRequest) {
  const blocked = await vendorGate(req)
  if (blocked) return blocked
  const q = req.nextUrl.searchParams
  return ok(await publicCatalog({ q: q.get('q') || '', kind: q.get('kind') || '' }))
}

export async function GET_product(req: NextRequest, slug: string) {
  const blocked = await vendorGate(req)
  if (blocked) return blocked
  const product = await publicProduct(slug)
  return product ? ok(product) : err('not found', 404)
}

/** POST /licenses/<activate|check|deactivate> — { key, slug, site, coreVersion } */
export async function POST_license(req: NextRequest, action: string) {
  const blocked = await vendorGate(req, 30)
  if (blocked) return blocked
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const slug = String(body?.slug || '')
  if (!body || !/^[a-z0-9-]{2,50}$/.test(slug)) return err('invalid request', 400)
  try {
    if (action === 'activate') return ok(await activateLicense({ key: body.key, slug, site: body.site, coreVersion: body.coreVersion, ipHash: ipHash(req) }))
    if (action === 'check') return ok(await checkLicense({ key: body.key, slug, site: body.site }))
    if (action === 'deactivate') return ok(await deactivateLicense({ key: body.key, slug, site: body.site }))
    return err('not found', 404)
  } catch (error) { return failure(error) }
}

/** GET /download/<slug>/<version> — a paid product needs x-license-key and x-license-site headers. */
export async function GET_download(req: NextRequest, slug: string, version: string) {
  const blocked = await vendorGate(req, 60)
  if (blocked) return blocked
  try {
    const file = await downloadRelease({ slug, version, key: req.headers.get('x-license-key'), site: req.headers.get('x-license-site') })
    return new Response(new Uint8Array(file.buffer), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${slug}-${file.version}.zip"`, 'X-Content-SHA256': file.sha256, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) { return failure(error) }
}

// ------------------------------------------------------------------ buyers

/** GET → the signed-in user's licenses (with full keys). POST { op: 'buy' | 'release-site' } */
export async function GET_mine(req: NextRequest) {
  const off = await moduleGuard('repository')
  if (off) return off
  const userId = await userIdOf(req)
  if (!userId) return err('ابتدا وارد حساب خود شوید', 401)
  return ok({ licenses: await licensesOf(userId) })
}

export async function POST_mine(req: NextRequest) {
  const blocked = await vendorGate(req, 30)
  if (blocked) return blocked
  const userId = await userIdOf(req)
  if (!userId) return err('ابتدا وارد حساب خود شوید', 401)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    if (body?.op === 'buy') {
      if (!rateLimitHit(`repo:buy:${userId}`, 10, 3_600_000).ok) return err('درخواست‌های خرید زیاد است', 429)
      return ok(await buyProduct(userId, Number(body.productId) || 0, String(body.requestId || '')))
    }
    if (body?.op === 'release-site') { await releaseSite(Number(body.licenseId) || 0, String(body.site || ''), { userId }); return ok({ ok: true }) }
    return err('عملیات نامعتبر است')
  } catch (error) { return failure(error) }
}

export async function GET_mineDownload(req: NextRequest) {
  const blocked = await vendorGate(req, 30)
  if (blocked) return blocked
  const userId = await userIdOf(req)
  if (!userId) return err('ابتدا وارد حساب خود شوید', 401)
  try {
    const file = await downloadForOwner(userId, Number(req.nextUrl.searchParams.get('license')) || 0, req.nextUrl.searchParams.get('version') || undefined)
    return new Response(new Uint8Array(file.buffer), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) { return failure(error) }
}
