import { requireModule } from '@/extensions/server/modules'
export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  await requireModule('forms')
  return children
}
