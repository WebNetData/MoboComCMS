import type { Metadata } from 'next'
import { getModuleSettings } from '@/extensions/server/modules'
import { shareCard } from '@/modules/site/server/seo'

/** A section landing page's metadata with the admin's SEO title/description (section settings) when set. */
export async function withSectionSeo(moduleId: string, meta: Metadata): Promise<Metadata> {
  const settings = await getModuleSettings(moduleId).catch(() => ({} as Record<string, unknown>))
  const title = typeof settings['seo.title'] === 'string' ? settings['seo.title'].trim() : ''
  const description = typeof settings['seo.description'] === 'string' ? settings['seo.description'].trim() : ''
  return shareCard({
    ...meta,
    ...(title ? { title: { absolute: title } } : {}),
    ...(description ? { description } : {}),
    ...(title || description ? { openGraph: { ...(meta.openGraph || {}), ...(title ? { title } : {}), ...(description ? { description } : {}) } } : {}),
  })
}

/** The name a section is shown under (breadcrumbs, messages): the admin's own name, else the given default. */
export async function sectionName(moduleId: string, fa: boolean, fallback: { fa: string; en: string }): Promise<string> {
  const settings = await getModuleSettings(moduleId).catch(() => ({} as Record<string, unknown>))
  const pick = (key: string) => (typeof settings[key] === 'string' ? (settings[key] as string).trim().slice(0, 60) : '')
  return fa ? pick('section.name') || fallback.fa : pick('section.name_en') || pick('section.name') || fallback.en
}
