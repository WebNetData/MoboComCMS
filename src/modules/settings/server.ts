import { db } from '@/platform/database/prisma'
import { cached, invalidate } from '@/platform/cache/kv'

// Settings are read on nearly every request; they are cached briefly and
// dropped on every write (lease rows change constantly and are never cached).
const TTL_MS = 30_000

export async function getSettings(): Promise<Record<string, string>> {
  const all = await cached('settings:all', TTL_MS, async () => {
    const rows = await db.setting.findMany({ where: { NOT: { key: { startsWith: 'lease.' } } } })
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  })
  return { ...all }
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  await invalidate('settings:').catch(() => undefined)
}

/** A JSON setting; a missing or corrupt value yields `undefined` so callers apply their defaults. */
export async function readJsonSetting(key: string): Promise<Record<string, unknown> | undefined> {
  const raw = await cached(`settings:key:${key}`, TTL_MS, async () => (await db.setting.findUnique({ where: { key } }).catch(() => null))?.value ?? null)
  if (raw === null) return undefined
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch { return undefined }
}

export async function writeJsonSetting(key: string, value: unknown) {
  await setSetting(key, JSON.stringify(value))
}

/**
 * Cluster-wide lease for background jobs: true when this process may run
 * `name` now. The expiry is stored as an ISO timestamp (which sorts as text),
 * so the conditional update is atomic on SQLite and PostgreSQL alike and only
 * one app instance wins each slot.
 */
export async function acquireLease(name: string, ttlMs: number): Promise<boolean> {
  const key = `lease.${name}`
  const now = new Date()
  const until = new Date(now.getTime() + ttlMs).toISOString()
  const { count } = await db.setting.updateMany({ where: { key, value: { lt: now.toISOString() } }, data: { value: until } })
  if (count) return true
  try {
    await db.setting.create({ data: { key, value: until } })
    return true
  } catch {
    return false // held by another instance (or created by it a moment ago)
  }
}
