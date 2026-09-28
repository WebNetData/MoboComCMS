'use client'

import type { ReactNode } from 'react'
import { setRouteAliases, type RouteAliases } from '@/platform/routing/aliases'

/** Publishes the section alias table to the browser before any link below it renders. */
export default function RouteAliasProvider({ map, children }: { map: RouteAliases; children: ReactNode }) {
  setRouteAliases(map)
  return <>{children}</>
}
