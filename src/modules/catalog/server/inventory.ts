import { db } from '@/platform/database/prisma'

export async function reserveInventory(input: { orderId: number; productId: number; variantId?: number | null; quantity?: number; holdMinutes?: number }) {
  const quantity = Math.max(1, Math.floor(input.quantity || 1))
  const holdMinutes = Math.max(5, Math.min(24 * 60, Math.floor(input.holdMinutes || 30)))
  try { return await db.$transaction(async (tx) => {
    const existing = await tx.inventoryReservation.findUnique({ where: { orderId: input.orderId } })
    if (existing) return { ok: existing.status !== 'RELEASED', reservation: existing }
    const product = await tx.product.findUnique({ where: { id: input.productId } })
    if (!product || !product.active) return { ok: false as const, message: 'product unavailable' }
    const variant = input.variantId ? await tx.productVariant.findFirst({ where: { id: input.variantId, productId: product.id, active: true } }) : null
    if (input.variantId && !variant) return { ok: false as const, message: 'variant unavailable' }
    const finite = product.stock >= 0
    const variantFinite = Boolean(variant && variant.stock >= 0)
    if (finite) {
      const changed = await tx.product.updateMany({
        where: { id: product.id, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      })
      if (changed.count !== 1) return { ok: false as const, message: 'out of stock' }
    }
    if (variantFinite) {
      const changed = await tx.productVariant.updateMany({ where: { id: variant!.id, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })
      if (changed.count !== 1) throw Error('out of stock')
    }
    const reservation = await tx.inventoryReservation.create({
      data: {
        orderId: input.orderId,
        productId: input.productId,
        variantId: variant?.id ?? null,
        variantFinite,
        quantity,
        finite,
        status: 'HELD',
        expiresAt: new Date(Date.now() + holdMinutes * 60_000),
      },
    })
    return { ok: true as const, reservation }
  }) } catch (error) { if (error instanceof Error && error.message === 'out of stock') return { ok: false as const, message: error.message }; throw error }
}

export async function ensureInventoryReservation(input: { orderId: number; productId: number; variantId?: number | null; quantity?: number; holdMinutes?: number }) {
  const quantity = Math.max(1, Math.floor(input.quantity || 1))
  const holdMinutes = Math.max(5, Math.min(24 * 60, Math.floor(input.holdMinutes || 30)))
  try { return await db.$transaction(async (tx) => {
    const existing = await tx.inventoryReservation.findUnique({ where: { orderId: input.orderId } })
    const now = new Date()
    if (existing?.status === 'CONSUMED') return { ok: true as const, reservation: existing }
    if (existing?.status === 'HELD' && existing.expiresAt > now) return { ok: true as const, reservation: existing }

    const product = await tx.product.findUnique({ where: { id: input.productId } })
    if (!product || !product.active) return { ok: false as const, message: 'product unavailable' }
    const variant = input.variantId ? await tx.productVariant.findFirst({ where: { id: input.variantId, productId: product.id, active: true } }) : null
    if (input.variantId && !variant) return { ok: false as const, message: 'variant unavailable' }
    const finite = product.stock >= 0
    const variantFinite = Boolean(variant && variant.stock >= 0)
    if (existing?.status === 'HELD') {
      // Expired but not yet released: its stock is still reserved. Extend the lease.
      const reservation = await tx.inventoryReservation.update({
        where: { id: existing.id },
        data: { expiresAt: new Date(Date.now() + holdMinutes * 60_000) },
      })
      return { ok: true as const, reservation }
    }
    if (variantFinite) {
      const changed = await tx.productVariant.updateMany({ where: { id: variant!.id, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })
      if (changed.count !== 1) throw Error('out of stock')
    }
    if (finite) {
      const changed = await tx.product.updateMany({
        where: { id: product.id, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      })
      if (changed.count !== 1) return { ok: false as const, message: 'out of stock' }
    }
    if (existing) {
      const reservation = await tx.inventoryReservation.update({
        where: { id: existing.id },
        data: { productId: product.id, variantId: variant?.id ?? null, quantity, finite, variantFinite, status: 'HELD', expiresAt: new Date(Date.now() + holdMinutes * 60_000) },
      })
      return { ok: true as const, reservation }
    }
    const reservation = await tx.inventoryReservation.create({
      data: { orderId: input.orderId, productId: product.id, variantId: variant?.id ?? null, quantity, finite, variantFinite, status: 'HELD', expiresAt: new Date(Date.now() + holdMinutes * 60_000) },
    })
    return { ok: true as const, reservation }
  }) } catch (error) { if (error instanceof Error && error.message === 'out of stock') return { ok: false as const, message: error.message }; throw error }
}

export async function consumeInventoryReservation(orderId: number) {
  const reservation = await db.inventoryReservation.findUnique({ where: { orderId } })
  if (!reservation) return { ok: true as const, consumed: false }
  if (reservation.status === 'CONSUMED') return { ok: true as const, consumed: true }
  if (reservation.status === 'RELEASED') return { ok: false as const, message: 'inventory reservation was released' }
  await db.inventoryReservation.update({ where: { id: reservation.id }, data: { status: 'CONSUMED' } })
  return { ok: true as const, consumed: true }
}

export async function releaseInventoryReservation(orderId: number) {
  return db.$transaction(async (tx) => {
    const reservation = await tx.inventoryReservation.findUnique({ where: { orderId } })
    if (!reservation || reservation.status !== 'HELD') return { ok: true as const, released: false }
    const changed = await tx.inventoryReservation.updateMany({
      where: { id: reservation.id, status: 'HELD' },
      data: { status: 'RELEASED' },
    })
    if (changed.count !== 1) return { ok: true as const, released: false }
    if (reservation.finite) {
      await tx.product.update({ where: { id: reservation.productId }, data: { stock: { increment: reservation.quantity } } })
    }
    if (reservation.variantFinite && reservation.variantId) await tx.productVariant.update({ where: { id: reservation.variantId }, data: { stock: { increment: reservation.quantity } } })
    return { ok: true as const, released: true }
  })
}

export async function releaseExpiredReservations(limit = 100) {
  const rows = await db.inventoryReservation.findMany({
    where: { status: 'HELD', expiresAt: { lt: new Date() } },
    orderBy: { expiresAt: 'asc' },
    take: Math.max(1, Math.min(500, limit)),
  })
  let released = 0
  for (const row of rows) if ((await releaseInventoryReservation(row.orderId)).released) released++
  return released
}
