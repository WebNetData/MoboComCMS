'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

interface Item {
  id: string
  text: string
  level: number
}

/**
 * The headings of an article as links. The one being read is marked: the last heading that has passed the upper
 * part of the window. Shown only when the article has at least two headings.
 */
export default function ArticleToc({ targetId = 'article-body' }: { targetId?: string }) {
  const { t } = useI18n()
  const [items, setItems] = useState<Item[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    const root = document.getElementById(targetId)
    if (!root) return
    const headings = Array.from(root.querySelectorAll('h2, h3')) as HTMLElement[]
    const next: Item[] = headings.map((h, i) => {
      if (!h.id) h.id = `section-${i + 1}`
      return { id: h.id, text: h.textContent || '', level: h.tagName === 'H2' ? 2 : 3 }
    })
    const listed = next.filter((i) => i.text.trim().length > 0)
    setItems(listed)
    if (listed.length < 2 || typeof IntersectionObserver === 'undefined') return
    // A heading counts as reached once it enters the top third of the window.
    const seen = new Set<string>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) seen.add(entry.target.id)
        else seen.delete(entry.target.id)
      }
      const reached = listed.filter((item) => seen.has(item.id))
      setActive(reached.length ? reached[reached.length - 1].id : '')
    }, { rootMargin: '0px 0px -66% 0px', threshold: 0 })
    for (const heading of headings) if (heading.id) observer.observe(heading)
    return () => observer.disconnect()
  }, [targetId])

  if (items.length < 2) return null

  return (
    <aside className="toc no-print">
      <div className="toc-title">{t.inThisArticle}</div>
      <nav aria-label={t.inThisArticle}>
        {items.map((i) => (
          <a key={i.id} href={`#${i.id}`} className={`${i.level === 3 ? 'toc-sub' : ''}${active === i.id ? ' is-active' : ''}`.trim() || undefined} aria-current={active === i.id ? 'location' : undefined}>
            {i.text}
          </a>
        ))}
      </nav>
    </aside>
  )
}
