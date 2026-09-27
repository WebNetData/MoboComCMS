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
