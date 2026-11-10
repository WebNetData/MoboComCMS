import { sectionNameNow } from '@/shared/site/section-names'

/**
 * A section's name as the site owner set it in Admin › sections (falls back to the built-in name). Usable from server
 * and client components alike: it reads the shared table without hooks.
 */
export default function SectionName({ id, fa = true, children, en }: { id: string; fa?: boolean; children: string; en?: string }) {
  return <>{sectionNameNow(id, fa, { fa: children, en })}</>
}
