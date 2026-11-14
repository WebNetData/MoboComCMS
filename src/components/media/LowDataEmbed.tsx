'use client'

import { useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { useLowData } from '@/components/site/LowDataProvider'

export default function LowDataEmbed({ src, title, className, style, allow = 'encrypted-media; picture-in-picture; fullscreen', sandbox, loading = 'lazy' }: { src: string; title: string; className?: string; style?: React.CSSProperties; allow?: string; sandbox?: string; loading?: 'eager' | 'lazy' }) {
  const { enabled, ready } = useLowData()
  const { locale } = useI18n()
  const [requested, setRequested] = useState(false)
  if (enabled && !requested) return <div className={`mc-low-data-embed${className ? ` ${className}` : ''}`} style={style}>
    <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => setRequested(true)}>{locale === 'fa' ? 'بارگذاری محتوای بیرونی' : 'Load embedded media'}<span className="sr-only">: {title}</span></button>
  </div>
  return <iframe className={className} style={style} src={src} title={title} allow={allow || undefined} allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox={sandbox} loading={loading} />
}
