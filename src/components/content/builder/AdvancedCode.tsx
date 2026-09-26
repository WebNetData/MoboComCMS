'use client'

import { useEffect, useRef } from 'react'

/**
 * Advanced code mode: the only place where admin-authored JavaScript runs.
 * Scripts injected via innerHTML never execute, so they are re-created as real
 * script nodes; everything is torn down when the block unmounts.
 */
export default function AdvancedCode({ html, css, js, className }: { html: string; css: string; js: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.innerHTML = html || ''
    root.querySelectorAll('script').forEach((old) => {
      const script = document.createElement('script')
      for (const attr of Array.from(old.attributes)) script.setAttribute(attr.name, attr.value)
      script.textContent = old.textContent || ''
      old.replaceWith(script)
    })
    let style: HTMLStyleElement | null = null
    if (css) {
      style = document.createElement('style')
      style.setAttribute('data-builder-code', '')
      style.textContent = css
      document.head.appendChild(style)
    }
    let run: HTMLScriptElement | null = null
    if (js) {
      run = document.createElement('script')
      run.setAttribute('data-builder-code', '')
      run.textContent = js
      root.appendChild(run)
    }
    return () => {
      style?.remove()
      run?.remove()
      root.innerHTML = ''
    }
  }, [html, css, js])

  return <div className={className || 'br-code'} ref={ref} />
}
