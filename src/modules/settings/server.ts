import { db } from '@/platform/database/prisma'

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany()
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

/** A JSON setting; a missing or corrupt value yields `undefined` so callers apply their defaults. */
export async function readJsonSetting(key: string): Promise<Record<string, unknown> | undefined> {
  const row = await db.setting.findUnique({ where: { key } }).catch(() => null)
  if (!row) return undefined
  try {
    const value = JSON.parse(row.value)
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
