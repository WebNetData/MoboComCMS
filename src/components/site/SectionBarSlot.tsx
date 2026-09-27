import SectionMegaBar from '@/components/site/SectionMegaBar'
import { getSectionBar } from '@/modules/navigation/server/megamenu'
import type { MegaSection } from '@/modules/navigation/domain/megamenu'

/** Server slot for a section's own menu bar (renders nothing when it is turned off). */
export default async function SectionBarSlot({ section, searchValue }: { section: MegaSection; searchValue?: string }) {
  const bar = await getSectionBar(section).catch(() => null)
  return bar ? <SectionMegaBar bar={bar} searchValue={searchValue} /> : null
}
