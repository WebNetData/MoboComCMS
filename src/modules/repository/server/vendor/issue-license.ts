import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { RepoError, updatesUntilFor } from '@/modules/repository/domain/repository'
import { newLicenseKey, sha256 } from '../crypto'
const hashKey = (key: string) => sha256(`license:${key}`)
export async function issueLicense(input: { productId: number; userId: number | null; email: string; source: 'PURCHASE' | 'GRANT'; paidMinor: bigint; note: string; paidAt?: Date }, reader: Pick<Prisma.TransactionClient, 'repoProduct' | 'repoLicense'> = db) {
  const product = await reader.repoProduct.findUnique({ where: { id: input.productId } })
  if (!product) throw new RepoError('محصول پیدا نشد', 404)
  const key = newLicenseKey()
  const license = await reader.repoLicense.create({
    data: { keyHash: hashKey(key), keyEnc: encryptPanelCredential(key), keyLast4: key.slice(-5), productId: product.id, userId: input.userId, email: input.email.slice(0, 254), source: input.source, siteLimit: product.siteLimit, paidMinor: input.paidMinor, currency: product.currency, note: input.note.slice(0, 300), createdAt: input.paidAt, updatesUntil: updatesUntilFor(product.supportDays, input.paidAt || new Date()) },
  })
  return { license, key }
}
