'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'

/**
 * Download-page tabs (links, installation, requirements, changes, reviews).
 * Every panel stays in the HTML for search engines and no-JS readers; a
 * matching #hash (e.g. #download from the header button) selects its tab.
 */
export default function DetailTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  const base = useId()
  useEffect(() => {
    const pick = () => { const hash = window.location.hash.slice(1); if (tabs.some((tab) => tab.id === hash)) setActive(hash) }
    pick()
    window.addEventListener('hashchange', pick)
    return () => window.removeEventListener('hashchange', pick)
  }, [tabs])
  const move = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    setActive(next.id)
    document.getElementById(`${base}-tab-${next.id}`)?.focus()
  }
  return <div className="sp-tabset">
    <div className="sp-tablist" role="tablist" aria-label="بخش‌های دانلود">
      {tabs.map((tab, index) => <button key={tab.id} id={`${base}-tab-${tab.id}`} type="button" role="tab" aria-selected={active === tab.id} aria-controls={`${base}-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onKeyDown={(event) => move(event, index)} onClick={() => setActive(tab.id)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <section key={tab.id} id={tab.id} className="sp-tabpanel" hidden={active !== tab.id}>
      <div id={`${base}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${tab.id}`}>{tab.content}</div>
    </section>)}
  </div>
}
