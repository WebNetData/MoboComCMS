import type { Metadata } from 'next'
import { getModuleSettings } from '@/extensions/server/modules'

/** A section landing page's metadata with the admin's SEO title/description (section settings) when set. */
export async function withSectionSeo(moduleId: string, meta: Metadata): Promise<Metadata> {
  const settings = await getModuleSettings(moduleId).catch(() => ({} as Record<string, unknown>))
  const title = typeof settings['seo.title'] === 'string' ? settings['seo.title'].trim() : ''
  const description = typeof settings['seo.description'] === 'string' ? settings['seo.description'].trim() : ''
  return {
    ...meta,
    ...(title ? { title: { absolute: title } } : {}),
    ...(description ? { description } : {}),
    ...(title || description ? { openGraph: { ...(meta.openGraph || {}), ...(title ? { title } : {}), ...(description ? { description } : {}) } } : {}),
  }
}
