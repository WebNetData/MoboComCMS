'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from '@/platform/routing/navigation'
import { snippetRuns, type SiteSnippet } from '@/modules/site/domain/site-code'

/**
 * Mounts the site-wide snippets whose conditions match this page. Scripts written as HTML do not run when set
 * through innerHTML, so they are re-created as real script elements, like the builder's advanced code. A snippet
 * stays mounted while it keeps matching, so analytics tags run once per visit rather than on every navigation.
 */
/** Scripts run at most once per page load: analytics must not count a visit twice when a snippet remounts. */
const ran = new Set<string>()
const live = (old: Element) => { const s = document.createElement('script'); for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value); s.textContent = old.textContent; return s }

function mount(snippet: SiteSnippet): () => void {
  const host = snippet.location === 'head' ? document.head : document.body
  const nodes: Node[] = [], key = `${snippet.id}\u0000${snippet.code}`, first = !ran.has(key)
  ran.add(key)
  const place = (node: Node) => { nodes.push(node); if (snippet.location === 'body-start') host.insertBefore(node, host.firstChild); else host.appendChild(node) }
  if (snippet.kind === 'css') {
    const style = document.createElement('style'); style.dataset.siteCode = snippet.id; style.textContent = snippet.code; place(style)
  } else if (snippet.kind === 'js') {
    if (first) { const script = document.createElement('script'); script.dataset.siteCode = snippet.id; script.textContent = snippet.code; place(script) }
  } else {
    const template = document.createElement('template'); template.innerHTML = snippet.code
    for (const node of Array.from(template.content.childNodes)) {
      // Template content never runs scripts: the first mount re-creates them; later mounts leave them out.
      if (node instanceof HTMLScriptElement) { if (first) place(live(node)); continue }
      if (node instanceof Element) {
        node.setAttribute('data-site-code', snippet.id)
        node.querySelectorAll('script').forEach(old => first ? old.replaceWith(live(old)) : old.remove())
      }
      place(node)
    }
  }
  return () => nodes.forEach(node => node.parentNode?.removeChild(node))
}

function Snippet({ snippet }: { snippet: SiteSnippet }) {
  useEffect(() => { try { return mount(snippet) } catch { return undefined } }, [snippet])
  return null
}

export default function SiteCode({ snippets }: { snippets: SiteSnippet[] }) {
  const path = usePathname()
  const { status } = useSession()
  if (status === 'loading') return null
  return <>{snippets.filter(s => snippetRuns(s, path, status === 'authenticated')).map(s => <Snippet key={s.id} snippet={s} />)}</>
}
