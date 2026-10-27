import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'

export type CompanyFigure = { value: number; label: string; href: string; icon: string }

/**
 * What the site really holds, for the about page: published items of the sections that are on, and active members.
 * A section that is off, a count that fails or a zero is left out; nothing is invented.
 */
export async function companyFigures(): Promise<CompanyFigure[]> {
  const now = new Date(), live = { status: 'PUBLISHED', publishedAt: { lte: now } }
  const counted = (module: string | null, work: () => Promise<number>) => (module ? isModuleEnabled(module) : Promise.resolve(true)).then((on) => (on ? work() : 0)).catch(() => 0)
  const [products, tracks, titles, games, members] = await Promise.all([
    counted('store', () => db.product.count({ where: { active: true } })),
    counted('music', () => db.musicTrack.count({ where: live })),
    counted('cinema', () => db.cinemaTitle.count({ where: live })),
    counted('games', () => db.gameTitle.count({ where: { status: 'PUBLISHED' } })),
    counted(null, () => db.user.count({ where: { status: 'ACTIVE' } })),
  ])
  const figures: CompanyFigure[] = [
    { value: products, label: 'محصول در فروشگاه', href: '/products', icon: 'bag' },
    { value: tracks, label: 'آهنگ', href: '/music', icon: 'music' },
    { value: titles, label: 'فیلم و سریال', href: '/cinema', icon: 'film' },
    { value: games, label: 'بازی', href: '/games', icon: 'gamepad' },
    { value: members, label: 'عضو', href: '/people', icon: 'users' },
  ]
  return figures.filter((figure) => figure.value > 0)
}
