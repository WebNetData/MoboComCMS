import { db } from '@/platform/database/prisma'

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany()
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}
