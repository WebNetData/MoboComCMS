'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

export type JournalTab = { label: string; href: string }

export default function JournalTabs({
  tabs,
  panels,
  moreLabel,
}: {
  tabs: JournalTab[]
  panels: ReactNode[]
  moreLabel: string
}) {
  const [active, setActive] = useState(0)
  if (tabs.length === 0) return null
  const current = Math.min(active, tabs.length - 1)

  return (
    <div className="ln-tabs">
      <div className="ln-tablist" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.href}
            type="button"
            role="tab"
            id={`ln-tab-${index}`}
            aria-controls={`ln-panel-${index}`}
            aria-selected={index === current}
            className={index === current ? 'is-active' : ''}
            onClick={() => setActive(index)}
          >
            {tab.label}
          </button>
        ))}
        <Link className="ln-tab-more" href={tabs[current].href}>
          {moreLabel}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
      </div>
      <div className="ln-tabpanel" role="tabpanel" id={`ln-panel-${current}`} aria-labelledby={`ln-tab-${current}`}>
        {panels[current]}
      </div>
    </div>
  )
}
