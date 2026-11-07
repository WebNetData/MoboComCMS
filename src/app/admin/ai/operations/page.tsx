'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Operations from '@/components/admin/ai/Operations'
import { workspacePath } from '@/modules/ai/domain/workspace'
function OperationalAssistantPage() {
  const search = useSearchParams()
  return <Operations source={workspacePath(search.get('from'))} />
}
export default function Page() { return <Suspense fallback={<p role="status">در حال دریافت دستیار…</p>}><OperationalAssistantPage /></Suspense> }
