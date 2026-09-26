'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

export default function ShareRow({ title }: { title: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [pageUrl, setPageUrl] = useState('')

  useEffect(() => {
    setPageUrl(window.location.href)
  }, [])

  function url() {
    return pageUrl || (typeof window === 'undefined' ? '' : window.location.href)
  }

  function copy() {
    navigator.clipboard.writeText(url())
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="share-row no-print">
      <span className="muted text-sm">{t.share}:</span>
      <a
        className="chip"
        target="_blank"
        rel="noreferrer"
        href={`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(title)}`}
      >
        Telegram
      </a>
      <a
        className="chip"
        target="_blank"
        rel="noreferrer"
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}`}
      >
        X
      </a>
      <a
        className="chip"
        target="_blank"
        rel="noreferrer"
        href={`https://wa.me/?text=${encodeURIComponent(title)}`}
      >
        WhatsApp
      </a>
      <button className="chip" onClick={copy}>
        {copied ? '✓' : '🔗'} {copied ? t.saved : t.copyLink}
      </button>
    </div>
  )
}
