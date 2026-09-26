import { notFound } from 'next/navigation'
import { isPublicApiEnabled } from '@/modules/public-api/server/availability'
import ApiKeysPage from '@/components/ApiKeysPage'
export default async function ApiPage() {
  if (!await isPublicApiEnabled()) notFound()
  return <ApiKeysPage />
}
