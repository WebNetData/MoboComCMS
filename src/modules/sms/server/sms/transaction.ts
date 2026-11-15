import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
export async function serializable<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: 'Serializable' }) }
    catch (error) {
      if ((error as { code?: string }).code !== 'P2034' || attempt >= 11) throw error
      // This transaction has not contacted the provider. Jitter lets simultaneous
      // reservations read the winning cap claim instead of conflicting in lockstep.
      await new Promise(resolve => setTimeout(resolve, 10 + Math.floor(Math.random() * Math.min(250, 20 * (attempt + 1)))))
    }
  }
}
