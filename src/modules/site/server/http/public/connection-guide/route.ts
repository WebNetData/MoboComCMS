import { getConnectionGuide } from '@/modules/site/server/connection-guide'
import { ok } from '@/platform/http/response'
export async function GET() {
  const response = ok(await getConnectionGuide())
  response.headers.set('Cache-Control', 'no-store')
  return response
}
