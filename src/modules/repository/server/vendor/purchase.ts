import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { moveWallet, walletBalance } from '@/modules/wallet/server/wallet'
import { requireUser } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { minorToDecimal, minorToNumber } from '@/shared/money'
import { RepoError } from '@/modules/repository/domain/repository'
import { issueLicense } from './issue-license'

/** One canonical payment/receipt transaction. Historical orphan debits require reconciliation, not replay. */
export async function buyProduct(userId: number, productId: number, requestId: string, context?: { req: NextRequest }) {
  const id = String(requestId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
  if (id.length < 8) throw new RepoError('درخواست نامعتبر است')
  const quote = await db.repoProduct.findUnique({ where: { id: productId } })
  if (!quote || !quote.active) throw new RepoError('این محصول در دسترس نیست', 404)
  if (quote.priceMinor === 0n) throw new RepoError('این محصول رایگان است و لایسنس نمی‌خواهد', 409)
  const marker = `buy:${id}`, paymentKey = `repo:buy:${userId}:${productId}:${id}`
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        if (context) {
          const current = await requireUser(context.req, tx)
          if (!current || current.id !== userId) throw new RepoError('ابتدا وارد حساب خود شوید', 401)
          if (await moduleGuard('repository', tx)) throw new RepoError('not found', 404)
          const row = await tx.setting.findUnique({ where: { key: 'repository.vendor.v1' } })
          let enabled = false
          try { enabled = row ? JSON.parse(row.value)?.enabled === true : false } catch { /* corrupt means unavailable */ }
          if (!enabled) throw new RepoError('not found', 404)
        }
        const product = await tx.repoProduct.findUnique({ where: { id: productId } })
        if (!product || !product.active) throw new RepoError('این محصول در دسترس نیست', 404)
        const existing = await tx.repoLicense.findFirst({ where: { userId, productId, note: marker }, select: { id: true } })
        if (existing) return { licenseId: existing.id, repeated: true }
        if (product.priceMinor !== quote.priceMinor || product.currency !== quote.currency) throw new RepoError('قیمت محصول تغییر کرده است؛ دوباره خرید را انجام دهید', 409)
        const previous = await tx.walletTx.findUnique({ where: { idempotencyKey: paymentKey } })
        if (previous) throw new RepoError('پرداخت قبلی نیاز به بررسی و بازیابی دارد؛ دوباره مبلغ کسر نمی‌شود', 409)
        const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } })
        if (!user) throw new RepoError('کاربر پیدا نشد', 404)
        const paid = await moveWallet({ userId, amount: minorToDecimal(-product.priceMinor, product.currency), currency: product.currency, type: 'PURCHASE', description: `خرید «${product.name}» از مخزن افزونه‌ها`, idempotencyKey: paymentKey }, tx)
        if (!paid.ok) {
          if (/insufficient/i.test(paid.message || '')) {
            const balance = await walletBalance(userId, product.currency, tx)
            throw new RepoError('موجودی کیف پول کافی نیست', 402, { shortfall: Math.max(0, minorToNumber(product.priceMinor, product.currency) - balance), currency: product.currency })
          }
          throw new RepoError(paid.message || 'پرداخت انجام نشد', 502)
        }
        const { license } = await issueLicense({ productId, userId, email: user.email, source: 'PURCHASE', paidMinor: product.priceMinor, note: marker }, tx)
        await tx.repoProduct.update({ where: { id: productId }, data: { sold: { increment: 1 } } })
        return { licenseId: license.id, repeated: false }
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 })
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null
      if (attempt >= 4 || (code !== 'P2034' && code !== 'P2002')) throw error
    }
  }
}
