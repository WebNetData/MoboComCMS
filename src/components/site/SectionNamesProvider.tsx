'use client'

import type { ReactNode } from 'react'
import { setSectionNames } from '@/shared/site/section-names'
import type { SectionNames } from '@/modules/site/domain/section-names'

/** Publishes the owner's section names to the browser before anything below renders one. */
export default function SectionNamesProvider({ names, children }: { names: SectionNames; children: ReactNode }) {
  setSectionNames(names)
  return <>{children}</>
}
