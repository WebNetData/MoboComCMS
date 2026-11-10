'use client'

import { useEffect } from 'react'

/**
 * The file store's cards lean toward the pointer and catch light where it is: one listener for the whole page, mouse
 * only, nothing with reduced motion. Sets --rx/--ry/--mx/--my on the card under the pointer.
 */
export default function FileStoreTilt() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0, current: HTMLElement | null = null
    const reset = (el: HTMLElement | null) => { if (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--mx'); el.style.removeProperty('--my') } }
    const move = (event: PointerEvent) => {
      const el = (event.target as Element | null)?.closest<HTMLElement>('[data-tilt]') || null
      if (el !== current) { reset(current); current = el }
      if (!el || event.pointerType !== 'mouse') return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect(), x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height
        el.style.setProperty('--ry', `${((x - .5) * 10).toFixed(2)}deg`)
        el.style.setProperty('--rx', `${((.5 - y) * 8).toFixed(2)}deg`)
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
      })
    }
    const leave = () => { reset(current); current = null }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame); reset(current) }
  }, [])
  return null
}
