import { EDITOR_BLOCKS as store } from '@/modules/catalog/domain/editor-blocks'
import { EDITOR_BLOCKS as journal } from '@/modules/journal/domain/editor-blocks'
import { EDITOR_BLOCKS as cinema } from '@/modules/cinema/domain/editor-blocks'
import { EDITOR_BLOCKS as music } from '@/modules/music/domain/editor-blocks'
import { EDITOR_BLOCKS as games } from '@/modules/games/domain/editor-blocks'
import { EDITOR_BLOCKS as software } from '@/modules/software/domain/editor-blocks'
import { EDITOR_BLOCKS as forum } from '@/modules/forum/domain/editor-blocks'

// Trusted build-time composition; each definition remains owned by its source module.
export const MODULE_BLOCKS = [...store, ...journal, ...cinema, ...music, ...games, ...software, ...forum]
