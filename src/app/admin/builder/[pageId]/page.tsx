'use client'

import { useParams } from 'next/navigation'
import BuilderEditor from '../editor'

export default function BuilderPage() {
  const params = useParams<{ pageId: string }>()
  return <BuilderEditor pageId={String(params.pageId)} />
}
