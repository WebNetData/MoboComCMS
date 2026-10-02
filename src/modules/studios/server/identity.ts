import type { Prisma } from '@prisma/client'

const display = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 160)

/** Shared identity for a developer or publisher, regardless of catalogue. */
export async function resolveStudioId(tx: Prisma.TransactionClient, value: unknown): Promise<number | null> {
  const name = display(value)
  if (!name) return null
  const normalizedName = name.toLowerCase()
  const studio = await tx.studio.upsert({ where: { normalizedName }, update: {}, create: { name, normalizedName }, select: { id: true } })
  return studio.id
}
