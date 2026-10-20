import { cache } from 'react'
import { randomBytes } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { DEFAULT_SEO, normalizeSeoConfig, type SeoConfig } from '@/modules/seo/domain/seo'
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'

const KEY = 'seo.config.v1'

/** SEO settings; older single settings (seoDescription, ogImage, googleVerification) seed the first read. */
export const getSeoConfig = cache(async (): Promise<SeoConfig> => {
  const rows = await db.setting.findMany({ where: { key: { in: [KEY, 'seoDescription', 'ogImage', 'googleVerification'] } } }).catch(() => [])
  const values = new Map(rows.map((row) => [row.key, row.value]))
  const stored = values.get(KEY)
  if (stored) { try { return normalizeSeoConfig(JSON.parse(stored)) } catch { /* fall through to defaults */ } }
  return normalizeSeoConfig({ description: values.get('seoDescription') || '', ogImage: values.get('ogImage') || '', verification: { google: values.get('googleVerification') || '' } }, DEFAULT_SEO)
})

const seoHistory = () => createSectionSettingsHistory(KEY, 'settings-seo', raw => normalizeSeoConfig(raw), () => ({}), { action: 'seo.config.update', targetId: KEY })
export const seoSettingsState = () => seoHistory().current()
export const restoreSeoSettings = (...args: Parameters<ReturnType<typeof seoHistory>['restore']>) => seoHistory().restore(...args)

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Saves the given fields; with an admin context it also records a version and the existing audit, in one transaction. */
export async function saveSeoConfig(input: unknown, context?: SectionSettingsContext): Promise<SeoConfig> {
  // A site still on the older single settings gets what it shows today written here first, so nothing is lost and the
  // first version (and the form's revision) match the page.
  if (!await db.setting.findUnique({ where: { key: KEY } })) await db.setting.create({ data: { key: KEY, value: JSON.stringify(await getSeoConfig()) } }).catch(() => undefined)
  const current = await seoHistory().read(), body = isRecord(input) ? input : {}
  // The IndexNow key is kept unless one is given, and made once when there is none.
  const indexNow = { ...current.indexNow, ...(isRecord(body.indexNow) ? body.indexNow : {}) }
  if (!indexNow.key) indexNow.key = current.indexNow.key || randomBytes(16).toString('hex')
  return seoHistory().save({ ...body, indexNow }, context)
}

/** The IndexNow key, created and stored on first use. */
export async function indexNowKey(): Promise<string> {
  const config = await getSeoConfig()
  if (config.indexNow.key) return config.indexNow.key
  return (await saveSeoConfig(config)).indexNow.key
}
