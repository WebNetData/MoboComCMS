// A staff member's saved views: a name for an admin address with its filters, kept with the account so it is
// there on every device. And the keyboard shortcuts of the admin workspace. Pure rules.

export const MAX_SAVED_VIEWS = 30
export const MAX_VIEW_NAME = 60

/** An admin address worth saving: inside /admin, on this site, of a sane length. Anything else is refused. */
export function normalizeViewHref(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (text.length > 500 || !/^\/admin(\/|\?|$)/.test(text) || /[\s<>"'\\]|\/\/|\.\./.test(text)) return null
  return text.replace(/#.*$/, '')
}

export const cleanViewName = (value: unknown) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_VIEW_NAME)

/** "g" then a letter goes to a section; one key does one thing. Shown as they are in the help. */
export const ADMIN_GO: readonly { key: string; href: string; fa: string; en: string }[] = [
  { key: 'd', href: '/admin', fa: 'نمای کلی', en: 'Overview' },
  { key: 'm', href: '/admin/moderation', fa: 'صف بررسی', en: 'Moderation queue' },
  { key: 'p', href: '/admin/posts', fa: 'مقاله‌ها', en: 'Posts' },
  { key: 'o', href: '/admin/store/orders', fa: 'سفارش‌ها', en: 'Orders' },
  { key: 'u', href: '/admin/users', fa: 'کاربران', en: 'Members' },
  { key: 'f', href: '/admin/forum', fa: 'تالار', en: 'Forum' },
  { key: 'a', href: '/admin/audit', fa: 'رخدادهای ممیزی', en: 'Audit log' },
]

export type ShortcutAction = { kind: 'go'; href: string } | { kind: 'search' } | { kind: 'help' } | { kind: 'save' } | { kind: 'views' } | { kind: 'wait' } | null

/**
 * What a key press means. `pending` is true right after "g". Nothing happens while the person is typing in
 * a field, or with a modifier held: shortcuts never take a key away from writing.
 */
export function shortcutFor(input: { key: string; typing: boolean; modifier: boolean; pending: boolean }): ShortcutAction {
  if (input.typing || input.modifier) return null
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key
  if (input.pending) { const target = ADMIN_GO.find((item) => item.key === key); return target ? { kind: 'go', href: target.href } : null }
  if (key === 'g') return { kind: 'wait' }
  if (key === '/') return { kind: 'search' }
  if (key === '?') return { kind: 'help' }
  if (key === 's') return { kind: 'save' }
  if (key === 'v') return { kind: 'views' }
  return null
}
