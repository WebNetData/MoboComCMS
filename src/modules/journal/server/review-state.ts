import type { Prisma } from '@prisma/client'

export type PostWriteState = { id: number; authorId: number | null; status: string; updatedAt: Date }

/** Lock precisely the row on which the caller's policy was decided, without advancing its version yet. */
export async function claimPostWrite(tx: Prisma.TransactionClient, expected: PostWriteState) {
  const claimed = await tx.post.updateMany({
    where: { id: expected.id, authorId: expected.authorId, status: expected.status, updatedAt: expected.updatedAt },
    data: { updatedAt: expected.updatedAt },
  })
  return claimed.count === 1
}
