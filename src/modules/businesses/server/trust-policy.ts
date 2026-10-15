import type { Prisma } from '@prisma/client'
import { getExtensionState } from '@/extensions/server/state'
import { BusinessError } from '../domain/businesses'
export async function businessTrustPolicy(tx?: Prisma.TransactionClient) {
  const { settings } = await getExtensionState('businesses', [], tx, true)
  for (const key of ['allow-reports','allow-purchase-proofs']) if (settings[key] !== undefined && typeof settings[key] !== 'boolean') throw new BusinessError('تنظیمات اعتماد معتبر نیست', 409)
  return { reports: settings['allow-reports'] !== false, proofs: settings['allow-purchase-proofs'] !== false }
}
