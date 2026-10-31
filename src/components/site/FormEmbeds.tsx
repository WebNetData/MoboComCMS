'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from '@/platform/routing/navigation'
import PublicForm from '@/components/site/PublicForm'
import type { FormDefinition, FormState } from '@/modules/forms/domain/forms'
import { editorialMedia, type EditorialMedia } from '@/shared/media/editorial'
import EditorialPlayer from '@/components/media/EditorialPlayer'

type Mount = { id: number; node: Element; slug: string; form?: FormDefinition; state?: FormState; missing?: boolean; media?: EditorialMedia }
let nextId = 0
/** The list without placeholders that left the page; the same list when none did (no needless render). */
const connected = (list: Mount[]) => (list.every((mount) => mount.node.isConnected) ? list : list.filter((mount) => mount.node.isConnected))
const loaded = new Map<string, Promise<{ form: FormDefinition; state: FormState } | null>>()
const load = (slug: string) => {
  if (!loaded.has(slug)) loaded.set(slug, fetch(`/api/forms/${slug}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null))
  return loaded.get(slug)!
}

/**
 * A form placed in written content (a `[form slug="…"]` shortcode or the editor's «فرم» block) leaves an empty
 * `[data-mc-form]` placeholder; this mounts the live form into each one, inside the site's own providers (a portal),
 * and again when the page's content changes. A form that is not published leaves its place empty.
 */
export default function FormEmbeds() {
  const pathname = usePathname()
  const [mounts, setMounts] = useState<Mount[]>([])
  useEffect(() => {
    const scan = () => {
      const nodes = [...document.querySelectorAll('[data-mc-form],figure[data-mc-media]')].filter((node) => !node.hasAttribute('data-mc-mounted') && !(node.hasAttribute('data-mc-media') && pathname?.startsWith('/admin')))
      if (!nodes.length) { setMounts(connected); return }
      const fresh: Mount[] = []
      for (const node of nodes) {
        node.setAttribute('data-mc-mounted', '')
        if (node.hasAttribute('data-mc-media')) {
          const media = editorialMedia({ kind: node.getAttribute('data-mc-media'), src: node.getAttribute('data-mc-src'), title: node.getAttribute('data-mc-title'), poster: node.getAttribute('data-mc-poster') || '', audioKind: node.getAttribute('data-mc-audio-kind'), ratio: node.getAttribute('data-mc-ratio') })
          const slot = node.querySelector(':scope > [data-mc-player]')
          if (media && slot) {
            // Older Classic insertions could nest later figures in this slot. Rescue
            // them in document order before enhancement clears the native fallback.
            let after = node
            for (const nested of slot.querySelectorAll('figure[data-mc-media]')) { after.after(nested); after = nested }
            slot.querySelectorAll('video,audio').forEach(element => (element as HTMLMediaElement).pause())
            slot.replaceChildren()
            fresh.push({ id: ++nextId, node: slot, slug: '', media })
          }
        } else fresh.push({ id: ++nextId, node, slug: node.getAttribute('data-mc-form') || '' })
      }
      setMounts((list) => [...connected(list), ...fresh])
      // Not tied to this run of the effect: a placeholder is marked once, so its form must arrive even if the effect
      // ran again meanwhile (React runs it twice in development).
      for (const mount of fresh.filter(item => !item.media)) void load(mount.slug).then((found) => {
        setMounts((list) => list.map((item) => (item.node === mount.node ? (found ? { ...item, form: found.form, state: found.state } : { ...item, missing: true }) : item)))
      })
    }
    scan()
    // Written content is set as HTML and may be replaced (navigation, a preview): look again when it changes.
    let timer = 0
    const observer = new MutationObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(scan, 80) })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [pathname])
  return <>{mounts.filter((mount) => (mount.media || mount.form) && mount.node.isConnected).map((mount) => createPortal(mount.media ? <EditorialPlayer media={mount.media} /> : <PublicForm form={mount.form!} state={mount.state} />, mount.node, `content-${mount.id}`))}</>
}
