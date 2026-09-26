import type { ComponentType } from 'react'
import type { ExtensionSiteContext, ExtensionUiSlot } from '@/platform/extensions/contracts'
import type { Locale } from '@/i18n/dictionaries'

export type PluginProps = {
  site: ExtensionSiteContext
  locale: Locale
  settings: Readonly<Record<string, unknown>>
}

export interface PluginUiContribution {
  slot: ExtensionUiSlot
  Component: ComponentType<PluginProps>
  order?: number
}

export interface PluginClientModule { ui?: readonly PluginUiContribution[]; AdminPage?: ComponentType }

