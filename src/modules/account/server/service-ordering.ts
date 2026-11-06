import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/modules/identity/auth'
import { isModuleEnabled } from '@/extensions/server/modules'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { sectionClosedFor } from './maintenance-access'
import { userOpensSection } from './section-access'

/** Shared dashboard presentation still observes each service owner's current access. */
export async function serviceOrderingAccess() {
  const session = await getServerSession(authOptions), userId = Number((session?.user as { id?: string | number } | undefined)?.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) redirect('/login?next=%2Fdashboard%2Forder')
  const [hosting, store] = await Promise.all((['hosting', 'store'] as const).map(async section =>
    (section === 'store' ? await isStoreEnabled() : await isModuleEnabled(section)) && !await sectionClosedFor(section, userId) && await userOpensSection(section, userId)))
  return { userId, hosting, store }
}
