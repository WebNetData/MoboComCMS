'use client'

import { useId, useState, type ReactNode } from 'react'

/** Pill tabs over server-rendered panels (all panels stay in the HTML). */
export default function TabSwitch({ tabs, className }: { tabs: { key: string; label: string; panel: ReactNode }[]; className?: string }) {
  const [active, setActive] = useState(tabs[0]?.key)
  const base = useId()
  return <div className={className}>
    <div className="gx-tabs" role="tablist">
      {tabs.map((tab) => <button key={tab.key} id={`${base}-${tab.key}`} type="button" role="tab" aria-selected={active === tab.key} aria-controls={`${base}-${tab.key}-panel`} onClick={() => setActive(tab.key)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.key} id={`${base}-${tab.key}-panel`} role="tabpanel" aria-labelledby={`${base}-${tab.key}`} hidden={active !== tab.key}>{tab.panel}</div>)}
  </div>
}
