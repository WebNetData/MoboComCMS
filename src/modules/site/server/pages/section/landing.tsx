import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import { ThemePageView } from '@/modules/site/server/pages/section/page'

/**
 * A published page template placed on a built-in section (e.g. /software)
 * replaces that section's default landing page; its sub-pages are unchanged.
 */
export async function sectionLanding(slug: string) {
  const placed = await resolvePlacedPage('section', slug).catch(() => null)
  return placed ? <ThemePageView meta={placed.meta} doc={placed.doc} /> : null
}
