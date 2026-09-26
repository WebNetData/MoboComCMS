'use client'
import type { ExtensionUiSlot } from '@/platform/extensions/contracts'
import type { PluginProps } from './types'
import { clientPlugins } from '@/extensions/generated/client-registry'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { useExtensions, usePackageSlots } from '@/extensions/client/ExtensionProvider'

export const pluginCatalog = extensionCatalog.filter((manifest) => manifest.kind === 'plugin')

export function PluginOutlet({ slot, site, locale }: Omit<PluginProps, 'settings'> & { slot: ExtensionUiSlot }) {
  const runtime = useExtensions()
  const packages = usePackageSlots()[slot] || []
  const contributions = Object.entries(clientPlugins)
    .filter(([id]) => runtime[id]?.enabled)
    .flatMap(([id, plugin]) => (plugin.ui || []).filter(item => item.slot === slot).map(item => ({ id, item })))
    .sort((a, b) => (a.item.order || 0) - (b.item.order || 0))
  return <>{contributions.map(({ id, item }, index) => <item.Component key={`${id}:${slot}:${index}`} site={site} locale={locale} settings={runtime[id]?.settings || {}} />)}{packages.map(item => <div key={`package:${item.id}`} className="package-slot" data-package={item.id} data-slot={slot} dangerouslySetInnerHTML={{ __html: item.html }} />)}</>
}
