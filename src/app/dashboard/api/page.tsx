import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { requireUser } from '@/modules/identity/server/access'
import { canManagePersonalApiKeys } from '@/modules/public-api/server/key-management-access'
import ApiKeysPage from '@/components/ApiKeysPage'
export default async function ApiPage() {
  const req = new NextRequest(new URL('/dashboard/api', process.env.NEXTAUTH_URL || 'http://localhost'), { headers: new Headers(await headers()) })
  const user = await requireUser(req)
  if (!user || !await canManagePersonalApiKeys(user.id)) notFound()
  return <ApiKeysPage />
}
