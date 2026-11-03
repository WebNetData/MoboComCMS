'use client'

import { useEffect } from 'react'

/** The account cards that take the light. Kept in step with the rule of the same list in account-design.css. */
const CARDS = '.member-shell .app-main :is(.ud-card, .ud-kpi:not(.is-wallet), .dt-row, .dt-tile, .rq-card, .sx-svc, .sx-my-order, .collections-card)'

/**
 * A soft light under the pointer on the account's cards. Only the card under a mouse gets its position;
 * touch screens and keyboards see the cards as they are.
 */
export default function Spotlight() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let frame = 0, x = 0, y = 0, target: Element | null = null, lit: HTMLElement | null = null
    const paint = () => {
      frame = 0
      const card = target?.closest<HTMLElement>(CARDS) || null
      if (lit && lit !== card) lit.style.removeProperty('--spot-o')
      lit = card
      if (!card) return
      const box = card.getBoundingClientRect()
      card.style.setProperty('--spot-x', `${x - box.left}px`)
      card.style.setProperty('--spot-y', `${y - box.top}px`)
      card.style.setProperty('--spot-o', '1')
    }
    const move = (event: PointerEvent) => { x = event.clientX; y = event.clientY; target = event.target as Element; if (!frame) frame = requestAnimationFrame(paint) }
    const leave = () => { lit?.style.removeProperty('--spot-o'); lit = null }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame) }
  }, [])
  return null
}
