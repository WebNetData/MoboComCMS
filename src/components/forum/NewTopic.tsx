'use client'

import { useRouter } from '@/platform/routing/navigation'
import Composer, { type ComposerCategory } from '@/components/forum/Composer'

/** Start a topic: title, category, tags and the Markdown body. */
export default function NewTopic({ categories, categoryId }: { categories: ComposerCategory[]; categoryId?: number }) {
  const router = useRouter()
  return (
    <Composer
      mode="topic"
      categories={categories}
      initial={{ categoryId }}
      draftKey="forum:draft:topic"
      submitLabel="ایجاد موضوع"
      busyLabel="در حال ایجاد…"
      autoFocus
      onSubmit={async (value) => {
        const response = await fetch('/api/forum/threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }).catch(() => null)
        const data = await response?.json().catch(() => null)
        if (!response?.ok) return data?.error || 'ایجاد موضوع انجام نشد'
        try { window.localStorage.removeItem('forum:draft:topic') } catch { /* storage unavailable */ }
        router.push(`/forum/t/${data.id}`)
        return null
      }}
    />
  )
}
