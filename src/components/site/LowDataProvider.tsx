'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const COOKIE = 'mobocom-low-data'
type LowDataContextValue = { enabled: boolean; ready: boolean; setEnabled: (enabled: boolean) => void }
const LowDataContext = createContext<LowDataContextValue>({ enabled: false, ready: false, setEnabled: () => undefined })

export function LowDataProvider({ initialEnabled, children }: { initialEnabled: boolean; children: ReactNode }) {
  const [enabled, setEnabledState] = useState(initialEnabled)
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])
  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    document.documentElement.dataset.lowData = next ? 'on' : 'off'
    document.cookie = `${COOKIE}=${next ? '1' : '0'}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }, [])
  const value = useMemo(() => ({ enabled, ready, setEnabled }), [enabled, ready, setEnabled])
  return <LowDataContext.Provider value={value}>{children}</LowDataContext.Provider>
}

export const useLowData = () => useContext(LowDataContext)
