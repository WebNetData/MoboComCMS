import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/modules/identity/auth'
import { resolveCurrentUser } from '@/modules/identity/server/access'
import { getServerLocale } from '@/i18n/server'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { builderPopupDesign } from '@/modules/popups/server/popups'
import PopupDesignBridge from './PopupDesignBridge'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'popup', robots: { index: false, follow: false } }

/** The content of a builder-designed popup, framed by the popup dialog. The audience is checked here again. */
export default async function PopupDesign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id)
  const user = Number.isSafeInteger(userId) && userId > 0 ? await resolveCurrentUser(userId, undefined) : null
  const design = /^\d{1,9}$/.test(id) ? await builderPopupDesign(user, Number(id)) : null
  const locale = (await getServerLocale()) === 'en' ? 'en' : 'fa'
  return <main className="popup-design" aria-label={design?.title || undefined}>
    <style>{'html,body{background:transparent!important;margin:0}.popup-design{padding:0}'}</style>
    {design && <BuilderRenderer doc={design.doc} locale={locale} />}
    <PopupDesignBridge />
  </main>
}
