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
function mount(snippet: SiteSnippet): () => void {
  const host = snippet.location === 'head' ? document.head : document.body
  const nodes: Node[] = []
  const place = (node: Node) => { nodes.push(node); if (snippet.location === 'body-start') host.insertBefore(node, host.firstChild); else host.appendChild(node) }
  if (snippet.kind === 'css') {
    const style = document.createElement('style'); style.dataset.siteCode = snippet.id; style.textContent = snippet.code; place(style)
  } else if (snippet.kind === 'js') {
    const script = document.createElement('script'); script.dataset.siteCode = snippet.id; script.textContent = snippet.code; place(script)
  } else {
    const template = document.createElement('template'); template.innerHTML = snippet.code
    for (const node of Array.from(template.content.childNodes)) {
      const live = node instanceof HTMLScriptElement ? (() => { const s = document.createElement('script'); for (const a of Array.from(node.attributes)) s.setAttribute(a.name, a.value); s.textContent = node.textContent; return s })() : node
      if (live instanceof Element) live.setAttribute('data-site-code', snippet.id)
      // Element nodes keep their own scripts dead (template content); re-create nested ones too.
      if (live instanceof Element) live.querySelectorAll('script').forEach(old => { const s = document.createElement('script'); for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value); s.textContent = old.textContent; old.replaceWith(s) })
      place(live)
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
