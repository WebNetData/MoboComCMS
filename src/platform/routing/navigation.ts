'use client'

import { usePathname as useNextPathname, useRouter as useNextRouter } from 'next/navigation'
import { useMemo } from 'react'
import { toInternalPath, toPublicPath } from '@/platform/routing/aliases'

// Client navigation that understands section addresses: components keep
// comparing and pushing internal routes (/forum/…), the browser sees the
// public ones (/discourse/…).

export { notFound, redirect, useParams, useSearchParams, useSelectedLayoutSegment, useSelectedLayoutSegments } from 'next/navigation'

/** The current path as the app's internal route. */
export function usePathname(): string {
  return toInternalPath(useNextPathname() || '/')
}

export function useRouter() {
  const router = useNextRouter()
  return useMemo(() => ({
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(toPublicPath(href), options),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(toPublicPath(href), options),
    prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(toPublicPath(href), options),
  }), [router])
}
