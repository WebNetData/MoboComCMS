'use client'

import { useRouter } from '@/platform/routing/navigation'
import Composer, { type ComposerCategory } from '@/components/forum/Composer'

/** Start a topic: title, category, tags and the Markdown body. */
export default function NewTopic({ categories, categoryId, context }: { categories: ComposerCategory[]; categoryId?: number; context?: { key: string; kind: 'QUESTION' | 'DISCUSSION' } }) {
  const router = useRouter()
  return (
    <Composer
      mode="topic"
      categories={categories}
      initial={{ categoryId }}
      draftKey={context ? `forum:draft:${context.kind}:${context.key}` : 'forum:draft:topic'}
      submitLabel={context?.kind === 'QUESTION' ? 'ثبت پرسش' : context ? 'شروع گفت‌وگو' : 'ایجاد موضوع'}
      busyLabel="در حال ایجاد…"
      autoFocus
      onSubmit={async (value) => {
        const response = await fetch('/api/forum/threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...value, item: context?.key, kind: context?.kind }) }).catch(() => null)
        const data = await response?.json().catch(() => null)
        if (!response?.ok) return data?.error || 'ایجاد موضوع انجام نشد'
        try { window.localStorage.removeItem(context ? `forum:draft:${context.kind}:${context.key}` : 'forum:draft:topic') } catch { /* storage unavailable */ }
        router.push(`/forum/t/${data.id}`)
        return null
      }}
    />
  )
}
