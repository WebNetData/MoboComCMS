'use client'
import { createContext, useContext } from 'react'
import type { ExtensionPublicState, ExtensionUiSlot } from '@/platform/extensions/contracts'

/** Sanitized HTML that uploaded (declarative) packages contribute to UI slots. */
export type PackageSlotMap = Partial<Record<ExtensionUiSlot, readonly { id: string; html: string }[]>>

const ExtensionContext = createContext<Record<string, ExtensionPublicState>>({})
const PackageSlotContext = createContext<PackageSlotMap>({})
export const useExtensions = () => useContext(ExtensionContext)
export const usePackageSlots = () => useContext(PackageSlotContext)
export default function ExtensionProvider({ runtime, packageSlots = {}, children }: { runtime: Record<string, ExtensionPublicState>; packageSlots?: PackageSlotMap; children: React.ReactNode }) {
  return <ExtensionContext.Provider value={runtime}><PackageSlotContext.Provider value={packageSlots}>{children}</PackageSlotContext.Provider></ExtensionContext.Provider>
}
