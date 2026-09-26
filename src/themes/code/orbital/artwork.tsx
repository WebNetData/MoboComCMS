'use client'

import { useState } from 'react'
import Glyph from './glyph'

export default function Artwork({ src, icon, kind }: { src: string; icon: string; kind: 'product' | 'story' }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  if (src && failedSource !== src) return <img src={src} alt="" loading="lazy" width={kind === 'product' ? 160 : 600} height={kind === 'product' ? 110 : 340} onError={() => setFailedSource(src)}/>
  return <>{kind === 'story' && <div className="hp-story-orbit"/>}<Glyph name={icon} size={kind === 'product' ? 68 : 64}/></>
}
