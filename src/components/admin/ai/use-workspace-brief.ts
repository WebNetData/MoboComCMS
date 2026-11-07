'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AI_WORKSPACE_EVENT, workspaceBrief, workspaceKey, type AiWorkspaceBrief, type AiWorkspaceKind } from '@/modules/ai/domain/workspace'

export function useWorkspaceBrief(kind: AiWorkspaceKind) {
  const { data: session } = useSession()
  const actor = String((session?.user as { id?: string | number } | undefined)?.id || '')
  const [brief, setBrief] = useState<AiWorkspaceBrief | null>(null)
  useEffect(() => {
    if (!actor) { setBrief(null); return }
    const read = () => {
      const key = workspaceKey(actor, kind)
      try {
        const raw = sessionStorage.getItem(key)
        if (!raw) return
        sessionStorage.removeItem(key)
        const value = workspaceBrief(JSON.parse(raw), actor, kind)
        if (value) setBrief(value)
      } catch { /* Storage can be disabled; manual instructions remain usable. */ }
    }
    read(); window.addEventListener(AI_WORKSPACE_EVENT, read)
    return () => window.removeEventListener(AI_WORKSPACE_EVENT, read)
  }, [actor, kind])
  return brief?.actor === actor ? brief : null
}
