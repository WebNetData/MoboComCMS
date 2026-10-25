import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'
import { GAME_LISTS } from '@/modules/games/domain/vocabulary'
import { SOFTWARE_LISTS } from '@/modules/software/domain/vocabulary'

/**
 * The sections that have managed lists: who manages them, who only reads them (a section author filling the item
 * form; lists are nobody's own items) and the lists themselves. A new section adds its lists here.
 */
export const VOCABULARY_SECTIONS = {
  games: { module: 'games', manage: 'games.manage', author: 'games.author', lists: GAME_LISTS },
  software: { module: 'software', manage: 'software.manage', author: 'software.author', lists: SOFTWARE_LISTS },
} as const satisfies Record<string, { module: string; manage: string; author: string; lists: ListDefinition[] }>

export type VocabularySection = keyof typeof VOCABULARY_SECTIONS
export const isVocabularySection = (value: unknown): value is VocabularySection => typeof value === 'string' && Object.hasOwn(VOCABULARY_SECTIONS, value)
export const listsOf = (section: VocabularySection): readonly ListDefinition[] => VOCABULARY_SECTIONS[section].lists
export const definitionOf = (section: string, list: unknown): ListDefinition | null => (isVocabularySection(section) ? listsOf(section).find((definition) => definition.list === list) ?? null : null)
