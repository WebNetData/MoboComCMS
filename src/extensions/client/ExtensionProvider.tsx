'use client'
import { createContext, useContext } from 'react'
import type { ExtensionPublicState } from '@/platform/extensions/contracts'

const ExtensionContext = createContext<Record<string, ExtensionPublicState>>({})
export const useExtensions = () => useContext(ExtensionContext)
export default function ExtensionProvider({ runtime, children }: { runtime: Record<string, ExtensionPublicState>; children: React.ReactNode }) {
  return <ExtensionContext.Provider value={runtime}>{children}</ExtensionContext.Provider>
}
