import { publicItemsBlock } from '@/modules/editor/domain/module-blocks'

export const EDITOR_BLOCKS = [
  publicItemsBlock('music.trackGrid', 'music', 'music', 'track', { fa: 'آهنگ‌ها', en: 'Music tracks' }),
  publicItemsBlock('music.albumGrid', 'music', 'music', 'album', { fa: 'آلبوم‌ها', en: 'Music albums' }),
  publicItemsBlock('music.artistGrid', 'music', 'music', 'artist', { fa: 'هنرمندان', en: 'Music artists' }),
]
