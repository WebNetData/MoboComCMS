import { cache } from 'react'
import { randomBytes } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { DEFAULT_SEO, normalizeSeoConfig, type SeoConfig } from '@/modules/seo/domain/seo'

const KEY = 'seo.config.v1'

/** SEO settings; older single settings (seoDescription, ogImage, googleVerification) seed the first read. */
export const getSeoConfig = cache(async (): Promise<SeoConfig> => {
  const rows = await db.setting.findMany({ where: { key: { in: [KEY, 'seoDescription', 'ogImage', 'googleVerification'] } } }).catch(() => [])
  const values = new Map(rows.map((row) => [row.key, row.value]))
  const stored = values.get(KEY)
  if (stored) { try { return normalizeSeoConfig(JSON.parse(stored)) } catch { /* fall through to defaults */ } }
  return normalizeSeoConfig({ description: values.get('seoDescription') || '', ogImage: values.get('ogImage') || '', verification: { google: values.get('googleVerification') || '' } }, DEFAULT_SEO)
})

export async function saveSeoConfig(input: unknown): Promise<SeoConfig> {
  const next = normalizeSeoConfig(input, await getSeoConfig())
  if (!next.indexNow.key) next.indexNow.key = randomBytes(16).toString('hex')
  const value = JSON.stringify(next)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  return next
}

/** The IndexNow key, created and stored on first use. */
export async function indexNowKey(): Promise<string> {
  const config = await getSeoConfig()
  if (config.indexNow.key) return config.indexNow.key
  return (await saveSeoConfig(config)).indexNow.key
}
