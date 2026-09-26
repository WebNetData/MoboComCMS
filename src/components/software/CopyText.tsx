'use client'
import { useState } from 'react'

/** Shows a value (e.g. the archive password) with a copy button. */
export default function CopyText({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <span className="sp-copy">
      <code dir="ltr">{value}</code>
      <button type="button" aria-label={`کپی ${label}`} onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ }
      }}>{done ? 'کپی شد ✓' : 'کپی'}</button>
    </span>
  )
}
