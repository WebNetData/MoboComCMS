'use client'

import { useState } from 'react'

const SIZES = ['sm', 'md', 'lg'] as const
type Size = (typeof SIZES)[number]

export default function JournalTextSize({ labels }: { labels: { title: string; smaller: string; larger: string } }) {
  const [size, setSize] = useState<Size>('md')

  function apply(next: Size) {
    setSize(next)
    const body = document.getElementById('article-body')
    if (body) body.setAttribute('data-font-size', next)
  }

  function step(direction: -1 | 1) {
    const index = SIZES.indexOf(size)
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, index + direction))]
    if (next !== size) apply(next)
  }

  return (
    <div className="ln-textsize" role="group" aria-label={labels.title}>
      <button type="button" aria-label={labels.smaller} disabled={size === 'sm'} onClick={() => step(-1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
      </button>
      <span>{labels.title}</span>
      <button type="button" aria-label={labels.larger} disabled={size === 'lg'} onClick={() => step(1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
      </button>
    </div>
  )
}
