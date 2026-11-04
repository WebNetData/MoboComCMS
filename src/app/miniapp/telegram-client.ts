type TgWebApp = {
  initData?: string
  colorScheme?: 'light' | 'dark'
  version?: string
  ready?: () => void
  expand?: () => void
  disableVerticalSwipes?: () => void
  openLink?: (url: string) => void
  HapticFeedback?: { impactOccurred?: (s: string) => void; selectionChanged?: () => void }
  BackButton?: { show?: () => void; hide?: () => void; onClick?: (handler: () => void) => void; offClick?: (handler: () => void) => void }
  themeParams?: Record<string, string>
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
  onEvent?: (event: string, handler: () => void) => void
  offEvent?: (event: string, handler: () => void) => void
  initDataUnsafe?: { user?: { first_name?: string; username?: string; photo_url?: string; id?: number } }
}

export function tg(): TgWebApp | undefined {
  return typeof window === 'undefined' ? undefined : (window as any).Telegram?.WebApp
}

export function paymentHref(url: string): string | null {
  if (typeof window === 'undefined' || !url.trim()) return null
  let destination: URL
  try { destination = new URL(url, window.location.origin) } catch { return null }
  if (!['https:', 'http:'].includes(destination.protocol)) return null
  return destination.href
}

/** Open internal invoices in this tab; use Telegram's external browser for gateways. */
export function openLink(url: string): boolean {
  const href = paymentHref(url)
  if (!href) return false
  const destination = new URL(href)
  if (destination.origin === window.location.origin) {
    window.location.assign(destination.href)
    return true
  }
  const app = tg()
  if (app?.openLink) {
    try { app.openLink(destination.href); return true } catch { return false }
  }
  // Async checkout has lost the original click gesture, so popups can be blocked.
  window.location.assign(destination.href)
  return true
}

/**
 * Telegram's chrome APIs only accept `#rrggbb` (or its own theme keywords), so
 * resolve whatever the design token computed to into a hex colour.
 */
function toHex(value: string): string {
  const raw = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw
  if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/i)
  if (!rgb) return ''
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Mirrors the site design tokens onto the Telegram client chrome (app header,
 * background and bottom bar) so the mini app frame matches the website theme
 * instead of Telegram's default palette.
 */
export function applyTelegramChrome() {
  const app = tg()
  if (!app || typeof document === 'undefined' || typeof getComputedStyle !== 'function') return
  const css = getComputedStyle(document.querySelector('.tg-app') || document.documentElement)
  const pick = (...names: string[]) => {
    for (const name of names) {
      const value = css.getPropertyValue(name).trim()
      if (value) return value
    }
    return ''
  }
  const background = toHex(pick('--bg', '--site-bg'))
  const surface = toHex(pick('--card', '--site-surface', '--bg-soft'))
  // Older Telegram clients reject unknown colours; the frame is cosmetic.
  try { if (background && app.setBackgroundColor) app.setBackgroundColor(background) } catch {}
  try { if (surface && app.setBottomBarColor) app.setBottomBarColor(surface) } catch {}
  try { if (background && app.setHeaderColor) app.setHeaderColor(background) } catch {}
}

/** Subscribes to a Telegram WebApp event; returns an unsubscribe function. */
export function onTelegramEvent(name: string, handler: () => void) {
  const app = tg()
  if (!app?.onEvent) return () => {}
  try { app.onEvent(name, handler) } catch { return () => {} }
  return () => { try { app.offEvent?.(name, handler) } catch {} }
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try { tg()?.HapticFeedback?.impactOccurred?.(style) } catch {}
}

/** A light tick when the selection changes (tab switch); nothing outside Telegram. */
export function selectionHaptic() {
  try { tg()?.HapticFeedback?.selectionChanged?.() } catch {}
}

/** Shows Telegram's own back button on inner pages and runs the handler on it; returns how to remove it. */
export function telegramBackButton(visible: boolean, handler: () => void) {
  const button = tg()?.BackButton
  if (!button) return () => {}
  try {
    if (!visible) { button.hide?.(); return () => {} }
    button.onClick?.(handler); button.show?.()
  } catch { return () => {} }
  return () => { try { button.offClick?.(handler); button.hide?.() } catch {} }
}
