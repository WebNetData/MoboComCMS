'use client'

import { useEffect } from 'react'

let mounted = 0

/**
 * Pointer effects of the builder's advanced style: one listener for the page sets --mx/--my (0…1) and --ptr-on on
 * the `.br-ptr` element under a fine pointer; CSS draws tilt, magnet and spotlight from them. Nothing runs for
 * touch screens or reduced motion.
 */
export default function PointerEffects() {
  useEffect(() => {
    if (mounted++ || !matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return () => { mounted-- }
    let frame = 0, active: HTMLElement | null = null, x = 0, y = 0
    const reset = (el: HTMLElement) => { el.style.setProperty('--mx', '.5'); el.style.setProperty('--my', '.5'); el.style.setProperty('--ptr-on', '0') }
    const paint = () => {
      frame = 0
      if (!active) return
      const box = active.getBoundingClientRect()
      active.style.setProperty('--mx', String(Math.min(1, Math.max(0, (x - box.left) / box.width))))
      active.style.setProperty('--my', String(Math.min(1, Math.max(0, (y - box.top) / box.height))))
      active.style.setProperty('--ptr-on', '1')
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const el = (event.target as Element | null)?.closest?.('.br-ptr') as HTMLElement | null
      if (active && active !== el) reset(active)
      active = el; x = event.clientX; y = event.clientY
      if (el && !frame) frame = requestAnimationFrame(paint)
    }
    const leave = () => { if (active) reset(active); active = null }
    document.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => { mounted--; cancelAnimationFrame(frame); document.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); if (active) reset(active) }
  }, [])
  return null
}
