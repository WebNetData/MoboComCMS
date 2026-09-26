'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

interface Item {
  id: string
  text: string
  level: number
}

export default function ArticleToc({ targetId = 'article-body' }: { targetId?: string }) {
  const { t } = useI18n()
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    const root = document.getElementById(targetId)
    if (!root) return
    const headings = Array.from(root.querySelectorAll('h2, h3')) as HTMLElement[]
    const next: Item[] = headings.map((h, i) => {
      if (!h.id) h.id = `section-${i + 1}`
      return { id: h.id, text: h.textContent || '', level: h.tagName === 'H2' ? 2 : 3 }
    })
    setItems(next.filter((i) => i.text.trim().length > 0))
  }, [targetId])

  if (items.length < 2) return null

  return (
    <aside className="toc no-print">
      <div className="toc-title">{t.inThisArticle}</div>
      <nav>
        {items.map((i) => (
          <a key={i.id} href={`#${i.id}`} className={i.level === 3 ? 'toc-sub' : ''}>
            {i.text}
          </a>
        ))}
      </nav>
    </aside>
  )
}
