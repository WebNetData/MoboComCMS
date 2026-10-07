'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'

// The editing engine is browser-only and large: it is loaded on this page alone, after the page itself.
const BlockEditorApp = dynamic(() => import('@/components/editor/gutenberg/BlockEditorApp'), { ssr: false, loading: () => <div className="mc-editor-message" aria-busy="true">در حال بارگذاری ویرایشگر…</div> })

export default function BlockEditorPage() {
  const id = Number(useParams<{ id: string }>().id)
  if (!Number.isInteger(id) || id < 1) return <div className="mc-editor-message" role="alert">صفحه پیدا نشد.</div>
  return <BlockEditorApp pageId={id} />
}
