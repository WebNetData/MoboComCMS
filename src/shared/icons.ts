/** Names supported by the shared SVG icon renderer; no markup from settings. */
const SUPPORTED_ICON_NAMES = [
  'copy', 'download', 'play', 'pause', 'mic', 'video', 'shield', 'arrow', 'globe', 'devices', 'wallet', 'chat',
  'sliders', 'grid', 'bolt', 'sparkles', 'plus', 'check', 'bell', 'upload', 'palette', 'code', 'file', 'heart',
  'music', 'clock', 'film', 'layers', 'bookmark', 'eye', 'eye-off', 'home', 'cart', 'receipt', 'key', 'megaphone',
  'bag', 'pin', 'gift', 'crown', 'book', 'rss', 'user', 'users', 'gamepad', 'folder', 'star', 'lifebuoy', 'chart',
  'image', 'mail', 'telegram', 'instagram', 'x', 'phone', 'wrench', 'search', 'store', 'tag', 'box', 'bank',
  'card', 'flag', 'plug', 'database', 'logout', 'external', 'lock', 'pen', 'ticket', 'server', 'link', 'layout',
  'chevron', 'cpu', 'activity', 'terminal', 'close', 'cloud',
] as const
export type IconName = typeof SUPPORTED_ICON_NAMES[number]
export const ICON_NAMES: string[] = [...SUPPORTED_ICON_NAMES]
export const isIconName = (value: unknown): value is IconName => typeof value === 'string' && (SUPPORTED_ICON_NAMES as readonly string[]).includes(value)
