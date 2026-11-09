'use client'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { pageTarget, type PageTarget } from '@/modules/ai/domain/page-assistant'

type Registration = { owner: string; target: PageTarget }
const Context = createContext<{ target: PageTarget | null; register: (value: Registration) => () => void } | null>(null)

/** UI selection only. Fields never enter this context; server guards remain authoritative. */
export function AiPageProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Registration | null>(null)
  const current = useRef<Registration | null>(null)
  const register = useCallback((value: Registration) => {
    current.current = value; setSelection(value)
    return () => { if (current.current?.owner === value.owner) { current.current = null; setSelection(null) } }
  }, [])
  const value = useMemo(() => ({ target: selection?.target || null, register }), [selection, register])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useAiPageSelection = () => useContext(Context)?.target || null
export function useAiPageRecord(kind: string, id: number | null, active: boolean) {
  const register = useContext(Context)?.register, owner = useId()
  useEffect(() => {
    const target = active ? pageTarget(kind, id) : null
    if (!register || !target) return
    return register({ owner, target })
  }, [register, owner, kind, id, active])
}
