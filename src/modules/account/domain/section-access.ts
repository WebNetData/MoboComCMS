import type { MaintenanceSectionId } from '@/modules/site/domain/maintenance'

// The public API of each section. A section limited to groups closes these too, or its pages would only hide what the
// API still answers. Shared addresses (media files, paid content) are decided by the code that serves them.
const SECTION_APIS: readonly (readonly [string, MaintenanceSectionId])[] = [
  ['/api/music', 'music'], ['/api/cinema', 'cinema'], ['/api/games', 'games'], ['/api/forum', 'forum'], ['/api/prompts', 'prompts'],
  ['/api/businesses', 'businesses'], ['/api/blog', 'magazine'], ['/api/cart', 'store'], ['/api/store', 'store'], ['/api/products', 'store'],
  ['/api/software', 'software'], ['/api/v1/products', 'store'],
]

export function sectionOfApi(path: string): MaintenanceSectionId | null {
  for (const [prefix, section] of SECTION_APIS) if (path === prefix || path.startsWith(`${prefix}/`)) return section
  return null
}

/** Where a guest signs in and comes back to the section. Only a same-site path travels in `next`. */
export const sectionLoginPath = (path: string, search: string) => `/login?next=${encodeURIComponent(`${path}${search}`)}`
