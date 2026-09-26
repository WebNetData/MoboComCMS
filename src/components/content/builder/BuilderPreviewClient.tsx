'use client'

import { useEffect } from 'react'

/**
 * Runs inside the builder's live-preview iframe (/builder-preview/<pageId>).
 *
 * - click → select the section / column / block in the editor
 * - drag a block or section inside the preview → move it
 * - drag a palette item from the editor into the preview → insert it at the drop point
 * - the editor highlights its current selection here
 *
 * It is a client component (not an inline <script>) so it also works when the page
 * streams in or is rendered on the client, and it re-scans the DOM with a
 * MutationObserver instead of relying on timers.
 */

type Incoming =
  | { source: 'happ-builder-editor'; type: 'select'; sectionId?: string | null; columnId?: string | null; widgetId?: string | null }
  | { source: 'happ-builder-editor'; type: 'palette-drag'; active: boolean; kind?: 'widget' | 'section'; widgetType?: string; columns?: number }

type DragKind = 'widget' | 'section' | 'new-widget' | 'new-section'

const ID = /^[a-zA-Z0-9_-]{1,64}$/
const safeId = (value: unknown) => (typeof value === 'string' && ID.test(value) ? value : null)

export default function BuilderPreviewClient({ pageId, empty }: { pageId: string; empty: { fa: string; en: string } }) {
  useEffect(() => {
    const doc = document
    const origin = window.location.origin
    const post = (message: Record<string, unknown>) => {
      if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'happ-builder-preview', pageId, ...message }, origin)
    }

    // ---- scroll restore between reloads ----
    const scrollKey = `happ-bp-scroll:${pageId}`
    try {
      const y = Number(sessionStorage.getItem(scrollKey) || 0)
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y))
    } catch { /* storage blocked */ }
    let scrollTimer: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => { try { sessionStorage.setItem(scrollKey, String(window.scrollY)) } catch { /* ignore */ } }, 150)
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // ---- draggable marking (outermost block / section only) ----
    const markDraggable = () => {
      doc.querySelectorAll<HTMLElement>('[data-bid],[data-sid]').forEach((el) => {
        const isWidget = el.hasAttribute('data-bid')
        const insideWidget = el.parentElement?.closest('[data-bid]')
        const insideSection = !isWidget && el.parentElement?.closest('[data-sid]')
        if (insideWidget || insideSection) return
        if (el.getAttribute('draggable') !== 'true') el.setAttribute('draggable', 'true')
      })
      // Images and links inside blocks would start a native drag instead of a block move.
      doc.querySelectorAll<HTMLElement>('[data-bid] img, [data-bid] a, [data-sid] img, [data-sid] a').forEach((el) => {
        if (el.getAttribute('draggable') !== 'false') el.setAttribute('draggable', 'false')
      })
    }
    let markQueued = false
    const queueMark = () => {
      if (markQueued) return
      markQueued = true
      requestAnimationFrame(() => { markQueued = false; markDraggable(); applySelection() })
    }
    const observer = new MutationObserver(queueMark)
    observer.observe(doc.body, { childList: true, subtree: true })

    // ---- selection highlight ----
    let selected: { sectionId: string | null; columnId: string | null; widgetId: string | null } = { sectionId: null, columnId: null, widgetId: null }
    const applySelection = (scroll = false) => {
      doc.querySelectorAll('.is-bld-selected').forEach((el) => el.classList.remove('is-bld-selected'))
      const selector = selected.widgetId ? `[data-bid="${selected.widgetId}"]`
        : selected.columnId ? `[data-cid="${selected.columnId}"]`
          : selected.sectionId ? `[data-sid="${selected.sectionId}"]` : ''
      if (!selector) return
      const el = doc.querySelector(selector)
      if (!el) return
      el.classList.add('is-bld-selected')
      if (scroll) {
        const rect = el.getBoundingClientRect()
        if (rect.bottom < 0 || rect.top > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }

    // ---- click to select (links never navigate inside the preview) ----
    const onClick = (event: MouseEvent) => {
      const node = event.target as Element | null
      if (!node?.closest) return
      if (node.closest('a')) event.preventDefault()
      const widget = node.closest('[data-bid]')
      const column = node.closest('[data-cid]')
      const section = node.closest('[data-sid]')
      if (!widget && !column && !section) return
      event.preventDefault()
      event.stopPropagation()
      post({
        type: 'select',
        sectionId: section?.getAttribute('data-sid') || null,
        columnId: column?.getAttribute('data-cid') || null,
        widgetId: widget?.getAttribute('data-bid') || null,
      })
    }
    // Forms inside the preview must never submit.
    const onSubmit = (event: Event) => event.preventDefault()

    // ---- drag & drop ----
    let kind: DragKind | null = null
    let dragEl: HTMLElement | null = null
    let paletteType = ''
    let paletteColumns = 1
    let line: HTMLDivElement | null = null
    let emptyZone: HTMLDivElement | null = null

    const hideLine = () => { line?.remove(); line = null }
    const clearSectionMarks = () => doc.querySelectorAll('.bld-section-over,.bld-section-before,.bld-section-after').forEach((el) => el.classList.remove('bld-section-over', 'bld-section-before', 'bld-section-after'))
    const hasSections = () => !!doc.querySelector('[data-sid]')
    const showEmptyZone = () => {
      if (emptyZone || hasSections()) return
      emptyZone = doc.createElement('div')
      emptyZone.className = 'bld-empty-drop'
      emptyZone.textContent = doc.documentElement.lang === 'fa' ? empty.fa : empty.en
      doc.body.appendChild(emptyZone)
    }
    const hideEmptyZone = () => { emptyZone?.remove(); emptyZone = null }
    const clearDrag = () => {
      kind = null; dragEl = null; paletteType = ''
      hideLine(); clearSectionMarks(); hideEmptyZone()
      doc.body.classList.remove('bld-dragging')
    }

    const cellsOf = (column: Element) => Array.from(column.children).filter((cell) => cell !== line && !(dragEl && cell.contains(dragEl)))
    const dropIndex = (column: Element, y: number) => {
      const cells = cellsOf(column)
      for (let i = 0; i < cells.length; i++) {
        const rect = cells[i].getBoundingClientRect()
        if (y < rect.top + rect.height / 2) return i
      }
      return cells.length
    }
    const showLine = (column: HTMLElement, index: number) => {
      if (getComputedStyle(column).position === 'static') column.style.position = 'relative'
      if (!line) { line = doc.createElement('div'); line.className = 'bld-dline' }
      if (line.parentNode !== column) column.appendChild(line)
      const cells = cellsOf(column)
      const base = column.getBoundingClientRect()
      let top = 0
      if (index < cells.length) top = cells[index].getBoundingClientRect().top - base.top - 2
      else if (cells.length) top = cells[cells.length - 1].getBoundingClientRect().bottom - base.top + 1
      line.style.top = `${Math.max(0, top)}px`
    }
    const columnAt = (node: Element | null) => {
      const column = node?.closest?.('[data-cid]') as HTMLElement | null
      if (!column) return null
      // Columns inside a block (e.g. a saved template) are not drop targets.
      if (column.closest('[data-bid]')) return null
      return column
    }
    const sectionAt = (node: Element | null) => {
      let current = node
      while (current && current !== doc.body) {
        if (current.hasAttribute('data-sid') && !current.parentElement?.closest('[data-bid]')) return current as HTMLElement
        current = current.parentElement
      }
      return null
    }

    const onDragStart = (event: DragEvent) => {
      const el = event.target as HTMLElement | null
      if (!el?.hasAttribute) return
      if (el.hasAttribute('data-bid')) kind = 'widget'
      else if (el.hasAttribute('data-sid')) kind = 'section'
      else return
      dragEl = el
      try { event.dataTransfer?.setData('text/plain', el.getAttribute('data-bid') || el.getAttribute('data-sid') || ''); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move' } catch { /* ignore */ }
      doc.body.classList.add('bld-dragging')
    }

    const onDragOver = (event: DragEvent) => {
      if (!kind) return
      const node = event.target as Element | null
      if (kind === 'widget' || kind === 'new-widget') {
        const column = columnAt(node)
        if (!column) {
          hideLine()
          if (kind === 'new-widget' && !hasSections()) { event.preventDefault(); showEmptyZone() }
          return
        }
        event.preventDefault()
        try { if (event.dataTransfer) event.dataTransfer.dropEffect = kind === 'widget' ? 'move' : 'copy' } catch { /* ignore */ }
        showLine(column, dropIndex(column, event.clientY))
        return
      }
      const target = sectionAt(node)
      clearSectionMarks()
      if (!target) {
        if (kind === 'new-section' && !hasSections()) { event.preventDefault(); showEmptyZone() }
        return
      }
      if (target === dragEl) return
      event.preventDefault()
      try { if (event.dataTransfer) event.dataTransfer.dropEffect = kind === 'section' ? 'move' : 'copy' } catch { /* ignore */ }
      const rect = target.getBoundingClientRect()
      target.classList.add('bld-section-over', event.clientY > rect.top + rect.height / 2 ? 'bld-section-after' : 'bld-section-before')
    }

    const onDrop = (event: DragEvent) => {
      if (!kind) return
      const node = event.target as Element | null
      if (kind === 'widget' || kind === 'new-widget') {
        const column = columnAt(node)
        if (!column) {
          if (kind === 'new-widget' && !hasSections()) { event.preventDefault(); post({ type: 'insert-widget', widgetType: paletteType, sectionId: null, columnId: null }) }
          clearDrag()
          return
        }
        event.preventDefault(); event.stopPropagation()
        const section = column.closest('[data-sid]')
        // The dragged block is excluded from the cells, matching the model (remove, then insert).
        const index = dropIndex(column, event.clientY)
        if (kind === 'widget' && dragEl) {
          post({ type: 'move-widget', widgetId: dragEl.getAttribute('data-bid'), sectionId: section?.getAttribute('data-sid') || null, columnId: column.getAttribute('data-cid'), index })
        } else {
          post({ type: 'insert-widget', widgetType: paletteType, sectionId: section?.getAttribute('data-sid') || null, columnId: column.getAttribute('data-cid'), index })
        }
        clearDrag()
        return
      }
      const target = sectionAt(node)
      if (!target) {
        if (kind === 'new-section' && !hasSections()) { event.preventDefault(); post({ type: 'insert-section', columns: paletteColumns, toId: null, after: true }) }
        clearDrag()
        return
      }
      if (target === dragEl) { clearDrag(); return }
      event.preventDefault(); event.stopPropagation()
      const rect = target.getBoundingClientRect()
      const after = event.clientY > rect.top + rect.height / 2
      if (kind === 'section' && dragEl) post({ type: 'move-section', fromId: dragEl.getAttribute('data-sid'), toId: target.getAttribute('data-sid'), after })
      else post({ type: 'insert-section', columns: paletteColumns, toId: target.getAttribute('data-sid'), after })
      clearDrag()
    }

    const onDragEnd = () => { if (kind === 'widget' || kind === 'section') clearDrag() }

    // ---- messages from the editor ----
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== window.parent) return
      const data = event.data as Incoming | null
      if (!data || data.source !== 'happ-builder-editor') return
      if (data.type === 'select') {
        selected = { sectionId: safeId(data.sectionId), columnId: safeId(data.columnId), widgetId: safeId(data.widgetId) }
        applySelection(true)
      } else if (data.type === 'palette-drag') {
        if (!data.active) { clearDrag(); return }
        kind = data.kind === 'section' ? 'new-section' : 'new-widget'
        paletteType = typeof data.widgetType === 'string' ? data.widgetType : ''
        paletteColumns = Math.min(4, Math.max(1, Number(data.columns) || 1))
        dragEl = null
        doc.body.classList.add('bld-dragging')
      }
    }

    // Editor shortcuts keep working while the preview has focus.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key !== 's' && key !== 'z' && key !== 'y') return
      const target = event.target as HTMLElement | null
      if (key !== 's' && target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      post({ type: 'key', key, shift: event.shiftKey })
    }

    doc.addEventListener('click', onClick, true)
    doc.addEventListener('submit', onSubmit, true)
    doc.addEventListener('dragstart', onDragStart, true)
    doc.addEventListener('dragover', onDragOver, true)
    doc.addEventListener('drop', onDrop, true)
    doc.addEventListener('dragend', onDragEnd, true)
    doc.addEventListener('keydown', onKey, true)
    window.addEventListener('message', onMessage)
    markDraggable()
    post({ type: 'ready' })

    return () => {
      observer.disconnect()
      clearTimeout(scrollTimer)
      window.removeEventListener('scroll', onScroll)
      doc.removeEventListener('click', onClick, true)
      doc.removeEventListener('submit', onSubmit, true)
      doc.removeEventListener('dragstart', onDragStart, true)
      doc.removeEventListener('dragover', onDragOver, true)
      doc.removeEventListener('drop', onDrop, true)
      doc.removeEventListener('dragend', onDragEnd, true)
      doc.removeEventListener('keydown', onKey, true)
      window.removeEventListener('message', onMessage)
      clearDrag()
    }
  }, [pageId, empty.fa, empty.en])

  return null
}
