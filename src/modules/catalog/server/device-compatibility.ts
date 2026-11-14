import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { normalizeDeviceModel, parseDeviceCompatibilityRows } from '@/modules/catalog/domain/device-compatibility'

type Client = Prisma.TransactionClient | typeof db

export async function replaceDeviceCompatibility(client: Client, productId: number, value: unknown) {
  const rows = parseDeviceCompatibilityRows(value)
  await client.productDeviceCompatibility.deleteMany({ where: { productId } })
  if (rows.length) await client.productDeviceCompatibility.createMany({ data: rows.map(row => ({ ...row, productId })) })
  return rows
}

/** Exact model lookup; normalization unifies Persian keyboard variants but never guesses. */
export async function lookupDeviceCompatibility(slug: string, model: unknown) {
  const normalizedModel = normalizeDeviceModel(model)
  if (!normalizedModel) return null
  const product = await db.product.findFirst({ where: { slug, active: true, approval: 'APPROVED', audienceGroups: '' }, select: { id: true } })
  if (!product) return null
  return db.productDeviceCompatibility.findUnique({
    where: { productId_normalizedModel: { productId: product.id, normalizedModel } },
    select: { deviceModel: true, status: true, note: true },
  })
}
