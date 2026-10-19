import { db } from '@/platform/database/prisma'
import { cached, invalidate } from '@/platform/cache/kv'
import type { Prisma } from '@prisma/client'
export { generalSettingsState, generalSettingsRevision, saveGeneralSettings, restoreGeneralSettings } from '@/modules/settings/server/general'

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
export async function readJsonSetting(key: string, reader?: Pick<Prisma.TransactionClient, 'setting'>): Promise<Record<string, unknown> | undefined> {
  const raw = reader
    ? (await reader.setting.findUnique({ where: { key } }))?.value ?? null
    : await cached(`settings:key:${key}`, TTL_MS, async () => (await db.setting.findUnique({ where: { key } }).catch(() => null))?.value ?? null)
  if (raw === null) return undefined
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch { return undefined }
}

export async function writeJsonSetting(key: string, value: unknown) {
  await setSetting(key, JSON.stringify(value))
}

export class JsonSettingMutationError extends Error {}

/** Fresh, strict object mutation. Callback is database-only and may run again on contention. */
export async function updateJsonSetting<T>(key: string, work: (value: Record<string, unknown>, tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await db.$transaction(async tx => {
        const row = await tx.setting.findUnique({ where: { key } })
        let value: Record<string, unknown>
        try {
          value = row ? JSON.parse(row.value) : {}
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object')
        } catch { throw new JsonSettingMutationError('invalid stored JSON setting') }
        const result = await work(value, tx), serialized = JSON.stringify(value)
        if (row) {
          const claim = await tx.setting.updateMany({ where: { key, value: row.value }, data: { value: serialized } })
          if (claim.count !== 1) throw new JsonSettingMutationError('setting changed concurrently')
        } else await tx.setting.create({ data: { key, value: serialized } })
        return result
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 })
      await invalidate('settings:').catch(() => undefined)
      return result
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null
      if (attempt >= 4 || (code !== 'P2034' && code !== 'P2002' && !(error instanceof JsonSettingMutationError && error.message === 'setting changed concurrently'))) throw error
    }
  }
}

/**
 * Cluster-wide lease for background jobs: true when this process may run
 * `name` now. The expiry is stored as an ISO timestamp (which sorts as text),
 * so the conditional update is atomic on SQLite and PostgreSQL alike and only
 * one app instance wins each slot.
 */
export async function acquireLease(name: string, ttlMs: number): Promise<boolean> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError('Lease duration must be positive and finite')
  const key = `lease.${name}`
  const now = new Date()
  const until = new Date(now.getTime() + ttlMs).toISOString()
  // Conflict is normal contention, not a failed insert. The conditional upsert
  // grants either the first slot or an expired one in a single database statement.
  // Real database failures propagate to the scheduler's jobs.failed handler.
  const rows = await db.$queryRaw<Array<{ key: string }>>`
    INSERT INTO "Setting" ("key", "value") VALUES (${key}, ${until})
    ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"
    WHERE "Setting"."value" < ${now.toISOString()}
    RETURNING "key"
  `
  return rows.length === 1
}
