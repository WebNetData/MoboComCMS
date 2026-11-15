import { isModuleEnabled } from '@/extensions/server/modules'
import { notFound } from 'next/navigation'
export default async function ServicesLayout({ children }: { children: React.ReactNode }) {
  if (!await isModuleEnabled('forms') && !await isModuleEnabled('store')) notFound()
  return children
}
