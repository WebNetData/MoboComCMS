import { randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'

const SAFE_KEY = /^[a-zA-Z0-9._:-]{1,100}$/

export interface ExtensionStorage {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

export function extensionStorage(pluginId: string): ExtensionStorage {
  const prefix = `extension.${pluginId}.data.`
  const keyOf = (key: string) => {
    if (!SAFE_KEY.test(key)) throw new Error('invalid extension storage key')
    return prefix + key
  }
  return {
    async get<T>(key: string) {
      const row = await db.setting.findUnique({ where: { key: keyOf(key) } })
      if (!row) return null
      try { return JSON.parse(row.value) as T } catch { return null }
    },
    async set(key: string, value: unknown) {
      const encoded = JSON.stringify(value)
      if (encoded.length > 100_000) throw new Error('extension storage value is too large')
      const full = keyOf(key)
      await db.setting.upsert({ where: { key: full }, create: { key: full, value: encoded }, update: { value: encoded } })
    },
    async delete(key: string) { await db.setting.deleteMany({ where: { key: keyOf(key) } }) },
  }
}


export async function enqueueExtensionJob(pluginId: string, jobName: string, payload: Record<string, unknown> = {}, dedupeKey?: string) {
  if (!SAFE_KEY.test(jobName)) throw new Error('invalid extension job name')
  const key = dedupeKey || `${pluginId}:${jobName}:${randomUUID()}`
  if (key.length > 200) throw new Error('extension job dedupe key is too long')
  return db.fulfillmentJob.upsert({
    where: { dedupeKey: `extension:${pluginId}:${key}` },
    create: {
      kind: 'EXTENSION_JOB',
      dedupeKey: `extension:${pluginId}:${key}`,
      payload: JSON.stringify({ pluginId, jobName, payload }),
    },
    update: {},
  })
}
