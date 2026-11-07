'use client'

import { createContext, useContext, isValidElement, Children, type ReactNode } from 'react'
import { DASHBOARD_PARTS, type DashboardPart } from '@/modules/site/domain/builder-surfaces'

type Parts = Partial<Record<DashboardPart, ReactNode>> & { all?: ReactNode }
const Context = createContext<Parts | null>(null)

/** Extract only the owner's marked nodes, never template input or another member's data. */
export function collectDashboardParts(node: ReactNode): Parts {
  const parts: Parts = { all: node }
  const visit = (tree: ReactNode) => Children.forEach(tree, child => {
    if (!isValidElement<{ 'data-dashboard-part'?: string; children?: ReactNode }>(child)) return
    const part = child.props['data-dashboard-part']
    if (part && (DASHBOARD_PARTS as readonly string[]).includes(part)) { parts[part as DashboardPart] = child; return }
    if (child.props.children) visit(child.props.children)
  })
  visit(node); return parts
}
export function DashboardDesignProvider({ original, children }: { original: ReactNode; children: ReactNode }) {
  return <Context.Provider value={collectDashboardParts(original)}>{children}</Context.Provider>
}
export function DashboardOutlet({ part }: { part: DashboardPart | 'all' }) {
  const parts = useContext(Context)
  return parts?.[part] || null
}
