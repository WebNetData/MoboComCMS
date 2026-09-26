'use client'

import { useEffect } from 'react'

type PreviewPayload = {
  type: 'studio-preview'
  designId?: string
  tokens?: Record<string, string>
  fonts?: { body?: string; heading?: string }
  customCss?: string
}

/**
 * Lives inside the studio live-preview iframe (/?preview=studio).
 * Applies unsaved design tokens coming from the studio via postMessage so the
 * customizer preview updates while typing, without publishing first.
 */
export default function PreviewBridge() {
  useEffect(() => {
    if (!window.location.search.includes('preview=studio')) return
    let styleEl: HTMLStyleElement | null = null
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as PreviewPayload | null
      if (!data || data.type !== 'studio-preview') return
      const root = document.documentElement
      if (data.designId) root.dataset.design = data.designId
      for (const [key, value] of Object.entries(data.tokens || {})) {
        if (typeof value === 'string') root.style.setProperty(key, value)
      }
      if (data.fonts) {
        if (data.fonts.body) root.style.setProperty('--site-font-body', data.fonts.body)
        if (data.fonts.heading) root.style.setProperty('--site-font-heading', data.fonts.heading)
      }
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'studio-preview-css'
        document.head.appendChild(styleEl)
      }
      styleEl.textContent = (data.customCss || '').replace(/<\s*\/?\s*(style|script)/gi, '')
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      styleEl?.remove()
    }
  }, [])
  return null
}
