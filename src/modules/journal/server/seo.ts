import type { Metadata } from 'next'
import { db } from '@/platform/database/prisma'
import { toPublicPath } from '@/platform/routing/aliases'
import { journalListingMeta } from '@/modules/journal/domain/journal'

/** The metadata of a magazine listing (category, archive page, search); null for the magazine home. */
export async function journalListingMetadata(params: { category?: string; q?: string; page?: string }): Promise<Metadata | null> {
  const slug = params.category?.trim() || ''
  const category = slug ? await db.postCategory.findUnique({ where: { slug }, select: { slug: true, name: true } }) : null
  const meta = journalListingMeta({ base: toPublicPath('/blog'), categoryAsked: slug || undefined, category, page: params.page, query: params.q })
  if (!meta) return null
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
    openGraph: { title: meta.title, description: meta.description, url: meta.canonical },
    ...(meta.index ? {} : { robots: { index: false, follow: true } }),
  }
}
