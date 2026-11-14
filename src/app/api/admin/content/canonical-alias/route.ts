import { canonicalAliasRoutes } from '@/modules/content/server/canonical-alias'

export const dynamic = 'force-dynamic'
export const { GET, POST } = canonicalAliasRoutes()
