import { requireModule } from '@/extensions/server/modules'
export default async function AiLayout({ children }: { children: React.ReactNode }) {
  await requireModule('ai-assistant')
  return children
}
