'use client'

import { useEffect, type RefObject } from 'react'

// Existing owners keep their UI/settings. Only the optional invitation yields
// space; measure rather than assume chat, queue or translated text heights.
const OBSTACLES = '.lc-root, .lc-panel, .mc-translate, .cmp-tray, .mu-player, .mu-queue, .fx-dock'

export function usePromptPlacement(ref: RefObject<HTMLDivElement | null>, kind: 'push' | 'install' | null) {
  useEffect(() => {
    const chip = ref.current
    if (!chip || !kind) return
    let frame = 0
    const observed = new Set<HTMLElement>()
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place) }
    const resize = new ResizeObserver(schedule)

    function place() {
      frame = 0
      if (!chip) return
      const obstacles = new Set(document.querySelectorAll<HTMLElement>(OBSTACLES))
      for (const node of observed) if (!obstacles.has(node)) { resize.unobserve(node); observed.delete(node) }
      for (const node of obstacles) if (!observed.has(node)) { resize.observe(node); observed.add(node) }

      // Read geometry before writing. Fixed coordinates use the layout viewport;
      // visualViewport also accounts for the mobile keyboard.
      const viewport = window.visualViewport
      const top = viewport?.offsetTop || 0
      const bottom = top + (viewport?.height || window.innerHeight)
      const box = chip.getBoundingClientRect()
      const safe = Number.parseFloat(getComputedStyle(chip).getPropertyValue('--pwa-safe-bottom')) || 0
      let edge = bottom - 16 - safe
      for (const node of obstacles) {
        const rect = node.getBoundingClientRect()
        if (!rect.width || !rect.height || rect.bottom <= top || rect.top >= bottom || rect.right <= box.left || rect.left >= box.right) continue
        const style = getComputedStyle(node)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        edge = Math.min(edge, rect.top - 12)
      }
      const deferred = edge - box.height < top + 16
      chip.style.setProperty('--pwa-bottom', `${Math.ceil(window.innerHeight - edge)}px`)
      chip.dataset.placement = deferred ? 'deferred' : 'ready'
      chip.inert = deferred
    }

    resize.observe(chip)
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] })
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
    }
  }, [ref, kind])
}
