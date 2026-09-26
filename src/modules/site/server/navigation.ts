import { db } from '@/platform/database/prisma'

export interface PublicNavigationPage {
  slug: string
  title: string
  titleEn: string
}

export async function getPublicNavigationPages(): Promise<PublicNavigationPage[]> {
  return db.page
    .findMany({
      where: { status: 'PUBLISHED', showInNav: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true, titleEn: true },
    })
    .catch(() => [])
}
