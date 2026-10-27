'use client'

import { useState } from 'react'

/** Copies the address or the coordinates of the company and says so for a moment (read out by screen readers too). */
export default function CompanyCopy({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1800) } catch { setDone(false) }
  }
  return <button type="button" className={className} onClick={() => void copy()} aria-live="polite">{done ? 'کپی شد ✓' : label}</button>
}
