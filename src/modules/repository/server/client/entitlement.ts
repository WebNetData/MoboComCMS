import type { Prisma } from '@prisma/client'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { certificateProblem, isCertificate, normalizeSiteHost, RepoError, type Certificate } from '@/modules/repository/domain/repository'
import { verifyPayload } from '../crypto'
import type { StoredLicense } from '../client'

export const LICENSES_KEY = 'repository.licenses.v1'
export interface InstallEntitlement { key: string; site: string; certificate: Certificate }

/** Downloads always ask the vendor; an expired offline certificate alone does not revoke an online entitlement. */
export function captureEntitlement(stored: StoredLicense | undefined, product: string, site: string, publicKey: string): InstallEntitlement {
  if (!stored) throw new RepoError('ابتدا لایسنس این محصول را فعال کنید', 402)
  if (!isCertificate(stored.certificate) || typeof stored.signature !== 'string' || typeof stored.keyEnc !== 'string' || stored.state === 'revoked' || !verifyPayload(stored.certificate, stored.signature, publicKey)) throw new RepoError('لایسنس معتبر نیست', 403)
  const problem = certificateProblem(stored.certificate, { product, site }, new Date())
  if (problem && problem !== 'expired') throw new RepoError('گواهی لایسنس برای این محصول و سایت معتبر نیست', 403)
  return { key: decryptPanelCredential(stored.keyEnc), site, certificate: { ...stored.certificate } }
}

/** Compare effective entitlement, permitting benign certificate renewal and transient provider unavailability. */
export async function assertCurrentEntitlement(tx: Prisma.TransactionClient, captured: InstallEntitlement, product: string, publicKey: string) {
  const row = await tx.setting.findUnique({ where: { key: LICENSES_KEY } })
  let licenses: Record<string, StoredLicense>
  try {
    licenses = row ? JSON.parse(row.value) : {}
    if (!licenses || typeof licenses !== 'object' || Array.isArray(licenses)) throw new Error('invalid license map')
  } catch { throw new RepoError('اطلاعات لایسنس نامعتبر است؛ پیش از نصب آن را بازیابی کنید', 409) }
  const stored = licenses[product]
  if (!stored) throw new RepoError('لایسنس هنگام دریافت بسته غیرفعال شده است', 403)
  const current = captureEntitlement(stored, product, captured.site, publicKey)
  if (current.key !== captured.key || current.certificate.license !== captured.certificate.license || current.certificate.updatesUntil !== captured.certificate.updatesUntil) throw new RepoError('مجوز لایسنس هنگام دریافت بسته تغییر کرده است؛ دوباره تلاش کنید', 409)
  if (normalizeSiteHost(await siteBaseUrl(tx)) !== captured.site) throw new RepoError('نشانی سایت هنگام دریافت بسته تغییر کرده است؛ دوباره تلاش کنید', 409)
}
