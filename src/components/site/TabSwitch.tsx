'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

/** Pill tabs over server-rendered panels (all panels stay in the HTML). */
export default function TabSwitch({ tabs, className, label }: { tabs: { key: string; label: string; panel: ReactNode }[]; className?: string; label?: string }) {
  const [active, setActive] = useState(tabs[0]?.key)
  const base = useId()
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    let next = index
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + tabs.length) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + tabs.length) % tabs.length
    else return
    event.preventDefault()
    setActive(tabs[next].key)
    document.getElementById(`${base}-${tabs[next].key}`)?.focus()
  }
  return <div className={className}>
    <div className="gx-tabs tab-pills" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.key} id={`${base}-${tab.key}`} type="button" role="tab" tabIndex={active === tab.key ? 0 : -1} aria-selected={active === tab.key} aria-controls={`${base}-${tab.key}-panel`} onKeyDown={event => navigate(event, index)} onClick={() => setActive(tab.key)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.key} id={`${base}-${tab.key}-panel`} role="tabpanel" aria-labelledby={`${base}-${tab.key}`} hidden={active !== tab.key}>{tab.panel}</div>)}
  </div>
}
