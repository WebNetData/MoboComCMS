import type { Prisma } from '@prisma/client'
import { splitList } from '@/modules/media/domain/media'

/** Counts how many software titles use each entry of the software lists: licence, platforms and app stores. */
export async function softwareUsage(client: Pick<Prisma.TransactionClient, 'softwareTitle'>) {
  const rows = await client.softwareTitle.findMany({ select: { license: true, platforms: true, appStores: true } })
  const counts: Record<string, Map<string, number>> = { LICENSE: new Map(), PLATFORM: new Map(), APP_STORE: new Map() }
  const add = (list: string, code: string) => counts[list].set(code, (counts[list].get(code) ?? 0) + 1)
  for (const row of rows) {
    add('LICENSE', row.license)
    for (const name of new Set(splitList(row.platforms, 50))) add('PLATFORM', name)
    let stores: unknown = []
    try { stores = JSON.parse(row.appStores || '[]') } catch { stores = [] }
    for (const store of new Set(Array.isArray(stores) ? stores.map((entry) => String(entry?.store ?? '')) : [])) if (store) add('APP_STORE', store)
  }
  return (list: string, code: string) => counts[list]?.get(code) ?? 0
}
