'use client'

import type { ImgHTMLAttributes } from 'react'
import { useLowData } from '@/components/site/LowDataProvider'
import { sized, srcSet } from '@/shared/media/image'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & { source: string; requestWidth: number }

/** Existing Media derivatives, selected at SSR and on preference changes without changing layout. */
export default function SiteImage({ source, requestWidth, ...props }: Props) {
  const { enabled } = useLowData()
  return <img {...props} src={sized(source, requestWidth, enabled)} srcSet={enabled ? undefined : srcSet(source, requestWidth)} />
}
