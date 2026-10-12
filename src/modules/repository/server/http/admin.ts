import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { PACKAGE_LIMITS } from '@/modules/packages/domain/format'
import { PackageAuthorityError } from '@/modules/packages/server/store'
import { RepoError } from '@/modules/repository/domain/repository'
import {
  deleteProduct, extendLicense, getVendorConfig, grantLicense, listLicenses, listProducts, previewPurchaseRecovery, recoverPurchase, releaseSite, repositoryStats, saveProduct, saveVendorConfig, setLicenseStatus, setReleasePublished, uploadRelease,
} from '@/modules/repository/server/vendor'
import { fetchRepositoryMeta, connectRepository, disconnectRepository, activateRepositoryLicense, deactivateRepositoryLicense, browseCatalog, getClientConfig, installFromRepository, refreshRepositoryLicenses, defaultRepositoryUrl } from '@/modules/repository/server/client'

const PERMS = ['repository.manage', 'settings.manage']
const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
const failure = (error: unknown) => { if (error instanceof PackageAuthorityError) return err('forbidden', 403); if (error instanceof RepoError) return err(error.message, error.status, error.meta); throw error }

// ---------------------------------------------------------------- vendor

/** GET ?view=overview|products|licenses|settings */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, 'repository', PERMS)
  if ('response' in guard) return guard.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view')) {
      case 'purchase-recovery': return ok(await previewPurchaseRecovery(idOf(q.get('paymentId')), { req, actor: guard.admin }))
      case 'products': return ok({ products: await listProducts() })
      case 'licenses': return ok({ ...(await listLicenses({ q: q.get('q') || '', productId: idOf(q.get('productId')), status: q.get('status') || '', page: Number(q.get('page')) || 1 })), canRecoverPurchases: Boolean(await requirePerm(req, 'finance.manage')) })
      case 'settings': return ok({ settings: await getVendorConfig() })
      default: return ok({ stats: await repositoryStats(), settings: await getVendorConfig() })
    }
  } catch (error) { return failure(error) }
}

/** POST { op } — product.save|delete, release.publish, license.grant|status|extend|site, settings */
export async function POST(req: NextRequest) {
  const guard = await adminGuard(req, 'repository', PERMS)
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return err('درخواست نامعتبر است')
  const audit = (action: string, targetId: string | number, metadata: Record<string, unknown> = {}) => auditAdmin({ req, actor: guard.admin, action: `repository.${action}`, targetType: 'repository', targetId: String(targetId), metadata })
  try {
    switch (body.op) {
      case 'purchase.recover': return ok(await recoverPurchase(idOf(body.paymentId), { mode: body.mode, evidence: body.evidence, acknowledgeCurrentTerms: body.acknowledgeCurrentTerms }, { req, actor: guard.admin }))
      case 'product.save': { const saved = await saveProduct(body, idOf(body.id) || undefined); await audit('product.save', saved.id, { slug: saved.slug }); return ok({ id: saved.id }) }
      case 'product.delete': { await deleteProduct(idOf(body.id)); await audit('product.delete', idOf(body.id)); return ok({ ok: true }) }
      case 'release.publish': { await setReleasePublished(idOf(body.id), body.published !== false); await audit('release.publish', idOf(body.id), { published: body.published !== false }); return ok({ ok: true }) }
      case 'license.grant': { const granted = await grantLicense({ productId: idOf(body.productId), email: String(body.email || ''), userId: idOf(body.userId) || undefined, note: String(body.note || '') }, { req, actor: guard.admin }); return ok(granted) }
      case 'license.status': { await setLicenseStatus(idOf(body.id), body.status === 'REVOKED' ? 'REVOKED' : 'ACTIVE', { req, actor: guard.admin }); return ok({ ok: true }) }
      case 'license.extend': { await extendLicense(idOf(body.id), Number(body.days), { req, actor: guard.admin }); return ok({ ok: true }) }
      case 'license.site': { await releaseSite(idOf(body.id), String(body.site || ''), undefined, { req, actor: guard.admin }); return ok({ ok: true }) }
      case 'settings': { const settings = await saveVendorConfig(body); await audit('settings', 'vendor', { enabled: settings.enabled }); return ok({ settings }) }
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}

/** POST multipart { productId, changelog, file } — a release zip. */
export async function POST_upload(req: NextRequest) {
  const guard = await adminGuard(req, 'repository', PERMS)
  if ('response' in guard) return guard.response
  if (Number(req.headers.get('content-length')) > PACKAGE_LIMITS.uploadBytes + 256 * 1024) return err('حجم فایل زیاد است', 413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!form || !(file instanceof File) || !file.size) return err('یک فایل zip انتخاب کنید')
  try {
    const release = await uploadRelease(idOf(form.get('productId')), Buffer.from(await file.arrayBuffer()), String(form.get('changelog') || ''))
    await auditAdmin({ req, actor: guard.admin, action: 'repository.release.upload', targetType: 'repository', targetId: String(release.id), metadata: { version: release.version } })
    return ok({ id: release.id, version: release.version })
  } catch (error) { return failure(error) }
}

// ---------------------------------------------------------------- client (this site browsing a repository)

export async function GET_client(req: NextRequest) {
  const guard = await adminGuard(req, 'repository', ['settings.manage'])
  if ('response' in guard) return guard.response
  try {
    const config = await getClientConfig()
    if (!config) return ok({ connected: false, defaultUrl: defaultRepositoryUrl() })
    if (req.nextUrl.searchParams.get('catalog') === '0') return ok({ connected: true, repository: config })
    return ok({ connected: true, ...(await browseCatalog({ q: req.nextUrl.searchParams.get('q') || '', kind: req.nextUrl.searchParams.get('kind') || '' })) })
  } catch (error) { return failure(error) }
}

/** POST { op: meta | connect | disconnect | activate | deactivate | install | refresh } */
export async function POST_client(req: NextRequest) {
  const guard = await adminGuard(req, 'repository', ['settings.manage'])
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return err('درخواست نامعتبر است')
  try {
    switch (body.op) {
      case 'meta': return ok(await fetchRepositoryMeta(String(body.url || '')))
      case 'connect': { const meta = await connectRepository(String(body.url || ''), String(body.fingerprint || ''), { req, actor: guard.admin }); return ok({ name: meta.name }) }
      case 'disconnect': { await disconnectRepository({ req, actor: guard.admin }); return ok({ ok: true }) }
      case 'activate': { const result = await activateRepositoryLicense(String(body.slug || ''), body.key, { req, actor: guard.admin }); return ok(result) }
      case 'deactivate': { await deactivateRepositoryLicense(String(body.slug || ''), { req, actor: guard.admin }); return ok({ ok: true }) }
      case 'install': { const result = await installFromRepository(String(body.slug || ''), guard.admin.email, { req, actor: guard.admin }); return ok(result) }
      case 'refresh': return ok(await refreshRepositoryLicenses({ req, actor: guard.admin }))
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}
