import Link from 'next/link'
import type { PluginClientModule, PluginProps } from '../types'

function SupportDock({ locale, settings }: PluginProps) {
  return <Link className="support-dock" href="/dashboard/tickets" aria-label={locale === 'fa' ? 'پشتیبانی' : 'Support'}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 18.5 3.5 21l.8-4A8 8 0 1 1 7 19.2"/><path d="M8 10h8M8 14h5"/></svg><span>{locale === 'fa' ? String(settings['label-fa'] || 'کنارت هستیم') : String(settings['label-en'] || 'Here to help')}</span></Link>
}

export const plugin: PluginClientModule = { ui: [{ slot: 'site.after-footer', Component: SupportDock }] }
