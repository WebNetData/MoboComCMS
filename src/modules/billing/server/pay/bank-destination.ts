import type { Prisma } from '@prisma/client'

export function payCollectionBank(tx: Prisma.TransactionClient, bankAccountIds: number[]) {
  return tx.bankAccount.findFirst({
    where: { collectionUse: 'GENERAL', ...(bankAccountIds.length ? { id: { in: bankAccountIds } } : {}), active: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
}
