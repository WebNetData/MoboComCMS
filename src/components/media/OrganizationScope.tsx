'use client'
import { createContext, useContext, type ReactNode } from 'react'
import type { AssetOrganization } from '@/modules/downloads/domain/organization'
const Context=createContext<AssetOrganization|undefined>(undefined)
export function OrganizationScope({value,children}:{value:AssetOrganization|undefined;children:ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>}
export const useAssetOrganization=()=>useContext(Context)
