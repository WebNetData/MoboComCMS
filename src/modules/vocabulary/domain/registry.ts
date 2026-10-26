import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'
import { GAME_LISTS } from '@/modules/games/domain/vocabulary'
import { SOFTWARE_LISTS } from '@/modules/software/domain/vocabulary'
import { MEDIA_LISTS } from '@/modules/media/domain/vocabulary'
import { MUSIC_LISTS } from '@/modules/music/domain/vocabulary'
import { JOURNAL_LISTS } from '@/modules/journal/domain/vocabulary'

/**
 * The sections that have managed lists: the module they belong to (none for lists shared by every section), who
 * manages them, who only reads them to fill an item form (a section author too: lists are nobody's own items) and
 * the lists themselves. A new section adds its lists here.
 */
export const VOCABULARY_SECTIONS = {
  games: { module: 'games', manage: ['games.manage'], read: ['games.manage', 'games.author'], lists: GAME_LISTS },
  software: { module: 'software', manage: ['software.manage'], read: ['software.manage', 'software.author'], lists: SOFTWARE_LISTS },
  music: { module: 'music', manage: ['music.manage'], read: ['music.manage', 'music.author'], lists: MUSIC_LISTS },
  // The magazine's permission is cms.posts (see rbac); its authors only read the formats to fill a post.
  journal: { module: 'journal', manage: ['cms.posts'], read: ['cms.posts', 'journal.author'], lists: JOURNAL_LISTS },
  // Download and stream links of every section: the site's settings or the film section (where dubs matter) manage them.
  media: { module: null, manage: ['settings.manage', 'cinema.manage'], read: ['settings.manage', 'cinema.manage', 'cinema.author', 'games.manage', 'games.author', 'software.manage', 'software.author'], lists: MEDIA_LISTS },
} as const satisfies Record<string, { module: string | null; manage: readonly string[]; read: readonly string[]; lists: ListDefinition[] }>

export type VocabularySection = keyof typeof VOCABULARY_SECTIONS
export const isVocabularySection = (value: unknown): value is VocabularySection => typeof value === 'string' && Object.hasOwn(VOCABULARY_SECTIONS, value)
export const listsOf = (section: VocabularySection): readonly ListDefinition[] => VOCABULARY_SECTIONS[section].lists
export const definitionOf = (section: string, list: unknown): ListDefinition | null => (isVocabularySection(section) ? listsOf(section).find((definition) => definition.list === list) ?? null : null)
