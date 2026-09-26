import { db } from '@/platform/database/prisma'
import { legacyNumber, minorToNumber, normalizeCurrency, toMinor } from '@/shared/money'

export type WalletTxType = 'TOPUP' | 'PURCHASE' | 'REFUND' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT' | 'RENEWAL' | 'REFERRAL'

export interface WalletMoveInput {
  userId: number
  amount: number | string
  currency?: string
  type: WalletTxType
  description?: string
  orderId?: number | null
  invoiceId?: number | null
  adminId?: number | null
  status?: 'DONE' | 'PENDING' | 'FAILED'
  /** Set for retryable commands. A key can move money at most once. */
  idempotencyKey?: string | null
  /** Reuse/settle an existing pending ledger row (for gateway top-ups). */
  txId?: number | null
}

export interface WalletMoveResult {
  ok: boolean
  message?: string
  currency?: string
  balance?: number
  balanceMinor?: bigint
  txId?: number
  idempotent?: boolean
}

async function ensureAccount(tx: any, userId: number, currency: string) {
  const existing = await tx.walletAccount.findUnique({ where: { userId_currency: { userId, currency } } })
  if (existing) return existing
  // One-time compatibility bridge for pre-foundation USD users.
  let initial = 0n
  if (currency === 'USD') {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { walletBalance: true } })
    if (!user) return null
    initial = toMinor(user.walletBalance || 0, currency)
  }
  return tx.walletAccount.create({ data: { userId, currency, balanceMinor: initial } })
}

/**
 * Atomic, currency-scoped wallet movement.
 * Debits use a conditional UPDATE, preventing concurrent requests from spending
 * the same balance. `idempotencyKey`/pending `txId` make retries safe.
 */
export async function moveWallet(input: WalletMoveInput): Promise<WalletMoveResult> {
  const currency = normalizeCurrency(input.currency || 'USD')
  let amountMinor: bigint
  try {
    amountMinor = toMinor(input.amount, currency)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'invalid amount' }
  }
  if (amountMinor === 0n) return { ok: false, message: 'amount must not be zero' }

  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const previous = await tx.walletTx.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
      if (previous?.status === 'DONE') {
        return {
          ok: true,
          currency: previous.currency,
          balance: minorToNumber(previous.balanceAfterMinor, previous.currency),
          balanceMinor: previous.balanceAfterMinor,
          txId: previous.id,
          idempotent: true,
        }
      }
    }

    const account = await ensureAccount(tx, input.userId, currency)
    if (!account) return { ok: false, message: 'user not found' }

    // When settling a pending top-up, atomically claim exactly that row once.
    // This protects against a signed callback and the recovery poller racing.
    if (input.txId) {
      const before = await tx.walletTx.findUnique({ where: { id: input.txId } })
      if (!before) return { ok: false, message: 'wallet transaction not found' }
      if (before.status === 'DONE') {
        return {
          ok: true,
          currency: before.currency,
          balance: minorToNumber(before.balanceAfterMinor, before.currency),
          balanceMinor: before.balanceAfterMinor,
          txId: before.id,
          idempotent: true,
        }
      }
      if (normalizeCurrency(before.currency) !== currency) return { ok: false, message: 'wallet transaction currency mismatch' }
      const claimed = await tx.walletTx.updateMany({
        where: { id: input.txId, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      })
      if (claimed.count !== 1) {
        const fresh = await tx.walletTx.findUnique({ where: { id: input.txId } })
        if (fresh?.status === 'DONE') {
          return {
            ok: true,
            currency: fresh.currency,
            balance: minorToNumber(fresh.balanceAfterMinor, fresh.currency),
            balanceMinor: fresh.balanceAfterMinor,
            txId: fresh.id,
            idempotent: true,
          }
        }
        return { ok: false, message: 'wallet transaction is already being settled or cannot be settled' }
      }
    }

    if (amountMinor < 0n) {
      const debit = -amountMinor
      const changed = await tx.walletAccount.updateMany({
        where: { id: account.id, balanceMinor: { gte: debit } },
        data: { balanceMinor: { decrement: debit } },
      })
      if (changed.count !== 1) return { ok: false, message: 'insufficient wallet balance' }
    } else {
      await tx.walletAccount.update({ where: { id: account.id }, data: { balanceMinor: { increment: amountMinor } } })
    }

    const updated = await tx.walletAccount.findUnique({ where: { id: account.id } })
    if (!updated) throw new Error('wallet account disappeared during transaction')
    const balance = legacyNumber(updated.balanceMinor, currency)
    const amount = legacyNumber(amountMinor, currency)

    const ledgerData = {
      userId: input.userId,
      amount,
      amountMinor,
      balanceAfter: balance,
      balanceAfterMinor: updated.balanceMinor,
      currency,
      type: input.type,
      status: input.status || 'DONE',
      description: input.description || '',
      orderId: input.orderId ?? null,
      invoiceId: input.invoiceId ?? null,
      adminId: input.adminId ?? null,
      idempotencyKey: input.idempotencyKey || null,
    }

    let txId = input.txId ?? null
    if (txId) {
      await tx.walletTx.update({ where: { id: txId }, data: ledgerData })
    } else {
      const row = await tx.walletTx.create({ data: ledgerData })
      txId = row.id
    }

    // Compatibility only: old screens/integrations may still read this USD mirror.
    if (currency === 'USD') {
      await tx.user.update({ where: { id: input.userId }, data: { walletBalance: balance } })
    }

    return { ok: true, currency, balance, balanceMinor: updated.balanceMinor, txId }
  })
}

export async function walletBalance(userId: number, currency = 'USD') {
  const code = normalizeCurrency(currency)
  const account = await db.walletAccount.findUnique({ where: { userId_currency: { userId, currency: code } } })
  if (account) return minorToNumber(account.balanceMinor, code)
  if (code !== 'USD') return 0
  const user = await db.user.findUnique({ where: { id: userId }, select: { walletBalance: true } })
  return Number(user?.walletBalance || 0)
}

export async function walletBalances(userId: number) {
  const accounts = await db.walletAccount.findMany({ where: { userId }, orderBy: { currency: 'asc' } })
  if (accounts.length) {
    return accounts.map((account) => ({
      currency: account.currency,
      balance: minorToNumber(account.balanceMinor, account.currency),
      balanceMinor: account.balanceMinor,
    }))
  }
  const legacy = await walletBalance(userId, 'USD')
  return legacy ? [{ currency: 'USD', balance: legacy, balanceMinor: toMinor(legacy, 'USD') }] : []
}

export interface WalletBalanceView {
  currency: string
  balance: number
}

/** Batch-load balances for admin/customer listings without an N+1 query per user. */
export async function walletBalancesForUsers(userIds: number[]): Promise<Map<number, WalletBalanceView[]>> {
  const ids = [...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0))]
  const result = new Map<number, WalletBalanceView[]>()
  if (!ids.length) return result

  const accounts = await db.walletAccount.findMany({
    where: { userId: { in: ids } },
    orderBy: [{ userId: 'asc' }, { currency: 'asc' }],
  })
  for (const account of accounts) {
    const list = result.get(account.userId) || []
    list.push({ currency: account.currency, balance: minorToNumber(account.balanceMinor, account.currency) })
    result.set(account.userId, list)
  }

  const missing = ids.filter((id) => !result.has(id))
  if (missing.length) {
    const legacyUsers = await db.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, walletBalance: true },
    })
    for (const user of legacyUsers) {
      const balance = Number(user.walletBalance || 0)
      result.set(user.id, balance ? [{ currency: 'USD', balance }] : [])
    }
  }

  return result
}

/** Records a pending top-up intent; no balance changes until the gateway settles it. */
export async function recordPendingTopup(input: {
  userId: number
  amount: number | string
  currency?: string
  invoiceId?: number | null
  description?: string
  idempotencyKey?: string | null
}) {
  const currency = normalizeCurrency(input.currency || 'USD')
  const amountMinor = toMinor(input.amount, currency)
  const balance = await walletBalance(input.userId, currency)
  const balanceAfterMinor = toMinor(balance, currency)
  return db.walletTx.create({
    data: {
      userId: input.userId,
      amount: legacyNumber(amountMinor, currency),
      amountMinor,
      balanceAfter: balance,
      balanceAfterMinor,
      currency,
      type: 'TOPUP',
      status: 'PENDING',
      description: input.description || 'wallet top-up',
      invoiceId: input.invoiceId ?? null,
      idempotencyKey: input.idempotencyKey || null,
    },
  })
}
