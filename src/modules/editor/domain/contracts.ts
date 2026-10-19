import type { MoboComBlock } from '@/modules/editor/domain/document'

/** Same-process Admin contract; every inbound value still receives server validation and owner guards. */
export type ModulePreviewRequest = { block: MoboComBlock } | { action: 'items'; type: string; query?: string; ids?: number[] }
export type ModuleItemChoice = { id: number; title: string }
export type ModulePreviewResponse = { html: string }
export type ModuleChoicesResponse = { items: ModuleItemChoice[]; selected: ModuleItemChoice[] }
