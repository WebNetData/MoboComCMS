import { cookies } from 'next/headers'
import SectionMegaBar from '@/components/site/SectionMegaBar'
import CartButton from '@/components/store/CartButton'
import { getSectionBar } from '@/modules/navigation/server/megamenu'
import type { MegaSection } from '@/modules/navigation/domain/megamenu'
import { CART_COOKIE, cartCount } from '@/modules/store/server/cart'
import { getViewer } from '@/modules/membership/server/membership'

/** Server slot for a section's own menu bar (renders nothing when it is turned off). */
export default async function SectionBarSlot({ section, searchValue }: { section: MegaSection; searchValue?: string }) {
  const bar = await getSectionBar(section).catch(() => null)
  if (!bar) return null
  // The shop bar carries the cart button with the current item count.
  const count = section === 'shop'
    ? await Promise.all([getViewer(), cookies()]).then(([viewer, jar]) => cartCount({ userId: viewer.userId, token: jar.get(CART_COOKIE)?.value || null })).catch(() => 0)
    : 0
  return <SectionMegaBar bar={bar} searchValue={searchValue} extra={section === 'shop' ? <CartButton initial={count} /> : undefined} />
}
