'use client'
import { useParams } from 'next/navigation'
import { clientPlugins } from '@/extensions/generated/client-registry'
import { useExtensions } from '@/extensions/client/ExtensionProvider'
import { useI18n } from '@/i18n/LocaleProvider'

export default function ExtensionAdminPage() {
  const { locale } = useI18n()
  const params = useParams()
  const pluginId = String(params?.plugin || '')
  const runtime = useExtensions()
  const Page = clientPlugins[pluginId]?.AdminPage
  if (!runtime[pluginId]?.enabled) return <div className="card">{locale === 'fa' ? 'این افزونه فعال نیست.' : 'This extension is disabled.'}</div>
  if (!Page) return <div className="card">{locale === 'fa' ? 'این افزونه صفحه مدیریتی ثبت نکرده است.' : 'This extension has no admin page.'}</div>
  return <Page />
}
