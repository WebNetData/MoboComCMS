import { publicItemsBlock } from '@/modules/editor/domain/module-blocks'

export const EDITOR_BLOCKS = [
  publicItemsBlock('cinema.titleGrid', 'cinema', 'cinema', 'title', { fa: 'فیلم‌ها و سریال‌ها', en: 'Cinema titles' }),
  publicItemsBlock('cinema.peopleGrid', 'cinema', 'cinema', 'person', { fa: 'عوامل سینما', en: 'Cinema people' }),
]
