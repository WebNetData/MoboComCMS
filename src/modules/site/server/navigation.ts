import { db } from '@/platform/database/prisma'
import { getSiteConfig } from '@/modules/site/config/store'

export interface PublicNavigationPage {
  slug: string
  title: string
  titleEn: string
}

export async function getPublicNavigationPages(): Promise<PublicNavigationPage[]> {
  if ((await getSiteConfig()).automaticPageLinks === false) return []
  return db.page
    .findMany({
      where: { status: 'PUBLISHED', showInNav: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true, titleEn: true },
    })
    .catch(() => [])
}
