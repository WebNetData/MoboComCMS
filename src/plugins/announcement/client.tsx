import Link from '@/platform/routing/Link'
import type { PluginClientModule, PluginProps } from '../types'
import { translateExtensionText } from '@/extensions/sdk/client'

function Announcement({ site, locale }: PluginProps) {
  return site.announcement.enabled ? <div className="announcement-bar"><span className="announcement-dot"/>{translateExtensionText(site.announcement.text, locale)}<Link href={site.announcement.link.href}>{translateExtensionText(site.announcement.link.label, locale)} <span aria-hidden="true">↗</span></Link></div> : null
}

export const plugin: PluginClientModule = { ui: [{ slot: 'site.before-header', Component: Announcement }] }
