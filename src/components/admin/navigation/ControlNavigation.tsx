'use client'

import { createContext, useContext } from 'react'
import type { ControlGroup } from './groups'

type Navigation = { groups: ControlGroup[]; loading: boolean; failed: boolean; retry: () => void }
const Context = createContext<Navigation | null>(null)
export const ControlNavigationProvider = Context.Provider

export function useControlNavigation() {
  const value = useContext(Context)
  if (!value) throw new Error('Admin control directory requires the Admin navigation owner')
  return value
}
