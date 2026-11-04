'use client'

import { setPermalinks, type PermalinkConfig } from '@/shared/routing/permalinks'
import type { ReactNode } from 'react'
import { setRouteAliases, type RouteAliases } from '@/platform/routing/aliases'

/** Publishes the section alias table to the browser before any link below it renders. */
export default function RouteAliasProvider({ map, permalinks, children }: { map: RouteAliases; permalinks?: PermalinkConfig; children: ReactNode }) {
  setRouteAliases(map)
  if (permalinks) setPermalinks(permalinks)
  return <>{children}</>
}
