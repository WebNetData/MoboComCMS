'use client'
import { useState } from 'react'
import Icon from '@/components/site/Icon'

/** An unavailable remote cover must still have a deliberate, readable empty state. */
export default function MiniAppArtwork({ src, icon = 'grid' }: { src: string; icon?: string }) {
  const [failed, setFailed] = useState('')
  return src && failed !== src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} /> : <Icon name={icon} size={32} />
}
