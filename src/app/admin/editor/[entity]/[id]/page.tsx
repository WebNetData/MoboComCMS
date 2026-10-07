'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'

// The editing engine is browser-only and large: it is loaded on this page alone, after the page itself.
const BlockEditorApp = dynamic(() => import('@/components/editor/gutenberg/BlockEditorApp'), { ssr: false, loading: () => <div className="mc-editor-message" aria-busy="true">در حال بارگذاری ویرایشگر…</div> })

export default function BlockEditorPage() {
  const params = useParams<{ entity: string; id: string }>()
  const id = Number(params.id)
  if ((params.entity !== 'pages' && params.entity !== 'posts') || !Number.isInteger(id) || id < 1) return <div className="mc-editor-message" role="alert">پیدا نشد.</div>
  return <BlockEditorApp entity={params.entity} itemId={id} />
}
