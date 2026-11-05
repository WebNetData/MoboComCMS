'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { automaticLinksAllowed, type AutomaticForwarderPolicy } from '@/modules/forwarder/domain/automatic'
import { watchAutomaticLinks } from '@/modules/forwarder/client/automatic-links'

/** One site-shell consumer covers rich HTML, bundled/uploaded themes and late-rendered anchors alike. */
export default function AutomaticLinks({ initialPolicy }: { initialPolicy: AutomaticForwarderPolicy }) {
  const pathname = usePathname()
  useEffect(() => {
    if (!automaticLinksAllowed(pathname)) return
    return watchAutomaticLinks(initialPolicy)
  }, [pathname, initialPolicy])
  return null
}
