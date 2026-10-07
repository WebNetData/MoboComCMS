// @wordpress/block-editor ships no type declarations. These are the parts the MoboCom editor uses,
// typed as it uses them; anything else of that package is deliberately not reachable from here.
declare module '@wordpress/block-editor' {
  import type { ComponentType, HTMLAttributes, ReactNode } from 'react'

  export interface EngineBlockObject { clientId: string; name: string; attributes: Record<string, unknown>; innerBlocks: EngineBlockObject[]; isValid: boolean }
  type WithChildren = { children?: ReactNode; className?: string }

  export const BlockEditorProvider: ComponentType<{ value: EngineBlockObject[]; onInput: (blocks: EngineBlockObject[]) => void; onChange: (blocks: EngineBlockObject[]) => void; settings?: Record<string, unknown>; children?: ReactNode }>
  export const BlockList: ComponentType<WithChildren>
  export const BlockTools: ComponentType<WithChildren>
  export const WritingFlow: ComponentType<WithChildren>
  export const ObserveTyping: ComponentType<WithChildren>
  export const BlockInspector: ComponentType<Record<string, never>>
  export const BlockToolbar: ComponentType<{ hideDragHandle?: boolean }>
  export const InspectorControls: ComponentType<{ children?: ReactNode }>
  export const Inserter: ComponentType<{ rootClientId?: string; isAppender?: boolean; position?: string }>
  export const __experimentalListView: ComponentType<Record<string, never>>
  export const BlockEditorKeyboardShortcuts: ComponentType<Record<string, never>> & { Register: ComponentType<Record<string, never>> }
  export const InnerBlocks: ComponentType<Record<string, never>> & { ButtonBlockAppender: ComponentType<Record<string, never>>; DefaultBlockAppender: ComponentType<Record<string, never>> }
  export function useBlockProps(props?: HTMLAttributes<HTMLElement>): HTMLAttributes<HTMLElement>
  export function useInnerBlocksProps(props?: HTMLAttributes<HTMLElement>, options?: { allowedBlocks?: string[] | boolean; orientation?: 'horizontal' | 'vertical'; renderAppender?: ComponentType<Record<string, never>> | false }): HTMLAttributes<HTMLElement>
}
