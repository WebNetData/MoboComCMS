'use client'

import dynamic from 'next/dynamic'
import { useExtensions } from '@/extensions/client/ExtensionProvider'
import { CLASSIC_EDITOR_PLUGIN, type ClassicToolbar } from '@/modules/editor/domain/classic'

// The one door every staff form uses for formatted text. While the Classic editor plugin is on it is the classic
// editor (Visual and Text tabs); switched off, forms fall back to the lighter editor they had before. Either way
// the value is HTML, cleaned by the server on save, so switching the plugin never touches stored content.

const loading = () => <div className="cms-editor-loading" aria-busy="true">…</div>
const ClassicEditor = dynamic(() => import('@/components/editor/classic/ClassicEditor'), { ssr: false, loading })
const RichEditor = dynamic(() => import('@/components/RichEditor'), { ssr: false, loading })

export interface ContentEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  dir?: 'rtl' | 'ltr'
  minHeight?: number
  compact?: boolean
  assetSection?: string
  toolbar?: ClassicToolbar
  /** A short note with no pictures and no HTML source (release notes, replies). */
  ticketMode?: boolean
}

export default function ContentEditor(props: ContentEditorProps) {
  const state = useExtensions()[CLASSIC_EDITOR_PLUGIN]
  if (!state?.enabled) return <RichEditor {...props} />
  return <ClassicEditor {...props} noMedia={props.ticketMode} toolbar={props.toolbar || (props.compact || props.ticketMode ? 'basic' : 'full')} startIn={state.settings?.['start-tab'] === 'text' ? 'text' : 'visual'} />
}
