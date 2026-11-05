import { automaticForwardHref, automaticLinksAllowed, type AutomaticForwarderPolicy } from '../domain/automatic'

/** Own only display attributes. React/editor content and persisted destinations are never mutated. */
export function installAutomaticLinks(policy: AutomaticForwarderPolicy) {
  const changed = new Map<HTMLAnchorElement, { original: string; wrapped: string; download: string | null }>()
  const restore = (anchor: HTMLAnchorElement) => {
    const previous = changed.get(anchor)
    if (!previous) return
    if (anchor.getAttribute('href') === previous.wrapped) {
      anchor.setAttribute('href', previous.original)
      if (previous.download !== null) anchor.setAttribute('download', previous.download)
    }
    changed.delete(anchor)
  }
  const apply = (anchor: HTMLAnchorElement) => {
    const previous = changed.get(anchor), current = anchor.getAttribute('href')
    const original = previous && current === previous.wrapped ? previous.original : current
    if (original === null) { changed.delete(anchor); return }
    const excluded = !automaticLinksAllowed(window.location.pathname) || anchor.closest('.admin-shell, [contenteditable]:not([contenteditable="false"])')
    const wrapped = excluded ? original : automaticForwardHref(original, window.location.origin, policy)
    if (wrapped === original) { restore(anchor); return }
    if (current === wrapped) return
    changed.set(anchor, { original, wrapped, download: previous && current === previous.wrapped ? previous.download : anchor.getAttribute('download') })
    // A same-origin wrapper must navigate to the countdown, rather than download its HTML.
    anchor.removeAttribute('download')
    anchor.setAttribute('href', wrapped)
  }
  const scan = (node: Node) => {
    if (node instanceof HTMLAnchorElement) apply(node)
    if (node instanceof Element || node instanceof Document) node.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(apply)
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') scan(record.target)
      else record.addedNodes.forEach(scan)
    }
    for (const anchor of changed.keys()) if (!anchor.isConnected) restore(anchor)
  })
  scan(document)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'contenteditable', 'class', 'download'] })
  // Cover anchors inserted/changed synchronously just before activation, including keyboard and middle-click.
  const activate = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (anchor) apply(anchor)
  }
  document.addEventListener('click', activate, true)
  document.addEventListener('auxclick', activate, true)
  return {
    update(next: AutomaticForwarderPolicy) { policy = next; scan(document) },
    dispose() {
      observer.disconnect()
      document.removeEventListener('click', activate, true)
      document.removeEventListener('auxclick', activate, true)
      for (const anchor of changed.keys()) restore(anchor)
    },
  }
}

/** The owner keeps observer, requests, timer and cross-tab policy refresh in one disposable lifetime. */
export function watchAutomaticLinks(initialPolicy: AutomaticForwarderPolicy) {
  const controller = installAutomaticLinks(initialPolicy), abort = new AbortController()
  let inFlight = false
  const refresh = async () => {
    if (inFlight || document.visibilityState === 'hidden') return
    inFlight = true
    try {
      const response = await fetch('/api/forwarder/policy', { cache: 'no-store', signal: abort.signal })
      if (!response.ok) throw Error('policy unavailable')
      const next: AutomaticForwarderPolicy = await response.json()
      if (typeof next.enabled !== 'boolean' || typeof next.siteHost !== 'string') throw Error('invalid policy')
      if (!abort.signal.aborted) controller.update(next)
    } catch { if (!abort.signal.aborted) controller.update({ ...initialPolicy, enabled: false }) }
    finally { inFlight = false }
  }
  void refresh()
  const interval = window.setInterval(() => { void refresh() }, 30_000)
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mobocom-forwarder') : null
  if (channel) channel.onmessage = () => { void refresh() }
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  return () => {
    abort.abort()
    window.clearInterval(interval)
    if (channel) { channel.onmessage = null; channel.close() }
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
    controller.dispose()
  }
}
