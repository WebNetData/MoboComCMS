'use client'
import type { PluginClientModule, PluginProps } from '@/plugins/types'

function Hello({ settings }: PluginProps) {
  const message = typeof settings.message === 'string' ? settings.message : ''
  if (!message) return null
  return <div className="card p-4 mb-4" role="note">{message}</div>
}

export const plugin: PluginClientModule = {
  ui: [{ slot: 'dashboard.top', Component: Hello, order: 50 }],
}
