// Which groups may see an item. Stored on the item as a list of site group keys; an empty value means everyone.
import { isSiteGroupKey } from '@/modules/account/domain/site-groups'
import { GroupError } from '@/modules/account/domain/user-groups'

export const AUDIENCE_ITEMS = {
  product: { model: 'product', permission: 'cms.products', label: 'محصول' },
  post: { model: 'post', permission: 'cms.posts', label: 'مطلب' },
  title: { model: 'cinemaTitle', permission: 'cinema.manage', label: 'فیلم یا سریال' },
  game: { model: 'gameTitle', permission: 'games.manage', label: 'بازی' },
  software: { model: 'softwareTitle', permission: 'software.manage', label: 'نرم‌افزار' },
  track: { model: 'musicTrack', permission: 'music.manage', label: 'آهنگ' },
  album: { model: 'musicAlbum', permission: 'music.manage', label: 'آلبوم' },
  prompt: { model: 'promptTemplate', permission: 'prompts.manage', label: 'پرامپت' },
} as const

export type AudienceItem = keyof typeof AUDIENCE_ITEMS
export const isAudienceItem = (value: unknown): value is AudienceItem => typeof value === 'string' && Object.hasOwn(AUDIENCE_ITEMS, value)

export const parseAudience = (raw: string | null | undefined): string[] => {
  if (!raw) return []
  try { const list = JSON.parse(raw); return Array.isArray(list) ? list.filter(isSiteGroupKey) : [] } catch { return [] }
}

/** The value kept on the item: sorted so one audience has one spelling, empty for everyone. */
export const storedAudience = (keys: unknown) => {
  if (!Array.isArray(keys) || keys.some(key => !isSiteGroupKey(key))) throw new GroupError('مخاطبان معتبر نیستند')
  const list = [...new Set(keys as string[])].sort()
  return list.length ? JSON.stringify(list) : ''
}
