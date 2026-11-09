'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from '@/platform/routing/navigation'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { fitsPage, isDue, popupDesignPath, type PopupSeen, type ServedPopup } from '@/modules/popups/domain/popups'

// The window and its styles load only when a popup is really shown, so a visit without one costs a single small request.
const PopupDialog = dynamic(() => import('./PopupDialog'), { ssr: false })

const LIST_KEY = 'mc-popups', GAP_KEY = 'mc-popup-shown'
/** How long a tab keeps the list before asking again. */
const LIST_MS = 3 * 60_000
/** At most one popup in this long, however many are waiting. */
const GAP_MS = 60_000

type Kept = { at: number; who: string; popups: ServedPopup[] }
const seenKey = (popup: ServedPopup) => `mc-popup:${popup.id}:${popup.revision}`
const stored = (area: 'local' | 'session', key: string) => { try { return (area === 'local' ? localStorage : sessionStorage).getItem(key) } catch { return null } }
const store = (area: 'local' | 'session', key: string, value: string) => { try { (area === 'local' ? localStorage : sessionStorage).setItem(key, value) } catch { /* private window: this tab simply remembers less */ } }
const parsed = <T,>(raw: string | null): T | null => { try { return raw ? JSON.parse(raw) as T : null } catch { return null } }

const send = (id: number, action: 'seen' | 'click') => fetch(`/api/popups/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }), keepalive: true }).catch(() => undefined)
const typing = () => { const el = document.activeElement as HTMLElement | null; return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) }

/** Finds the popup due for this visitor on this page and shows it. A member's count is on the server, a guest's in this browser. */
export default function SitePopups() {
  const on = useModuleEnabled('popups')
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [popup, setPopup] = useState<ServedPopup | null>(null)
  const list = useRef<Kept | null>(null)
  const who = (session?.user as { id?: string } | undefined)?.id || 'guest'

  useEffect(() => {
    // The frame that shows a builder-designed popup never opens popups itself.
    if (!on || status === 'loading' || popup || !pathname || pathname.startsWith('/popup-design/')) return
    let live = true, timer = 0
    const choose = (popups: ServedPopup[]) => {
      const now = Date.now()
      if (now - Number(stored('session', GAP_KEY) || 0) < GAP_MS) return
      const next = popups.find((item) => fitsPage(item, pathname) && (who !== 'guest' || isDue(item, parsed<PopupSeen>(stored('local', seenKey(item))), now)))
      if (!next) return
      // Never in the middle of typing or on a hidden tab: it waits for the next moment.
      const open = () => {
        if (!live) return
        if (document.hidden || typing()) { timer = window.setTimeout(open, 4000); return }
        store('session', GAP_KEY, String(Date.now()))
        if (who === 'guest') store('local', seenKey(next), JSON.stringify({ views: (parsed<PopupSeen>(stored('local', seenKey(next)))?.views || 0) + 1, lastAt: Date.now() }))
        void send(next.id, 'seen')
        if (list.current) { list.current.popups = list.current.popups.filter((item) => item.id !== next.id); store('session', LIST_KEY, JSON.stringify(list.current)) }
        setPopup(next)
      }
      timer = window.setTimeout(open, next.delaySeconds * 1000)
    }
    const kept = list.current || parsed<Kept>(stored('session', LIST_KEY))
    if (kept && kept.who === who && Date.now() - kept.at < LIST_MS) { list.current = kept; choose(kept.popups); return () => { live = false; window.clearTimeout(timer) } }
    void fetch('/api/popups', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!live || !data) return
      list.current = { at: Date.now(), who, popups: data.popups || [] }
      store('session', LIST_KEY, JSON.stringify(list.current))
      choose(list.current.popups)
    }).catch(() => undefined)
    return () => { live = false; window.clearTimeout(timer) }
  }, [on, status, who, pathname, popup])

  const close = useCallback(() => setPopup(null), [])
  const act = useCallback(() => { if (popup) void send(popup.id, 'click') }, [popup])
  return popup ? <PopupDialog popup={popup} frameSrc={popup.design === 'builder' ? popupDesignPath(popup.id, popup.revision) : undefined} onClose={close} onAction={act} /> : null
}
