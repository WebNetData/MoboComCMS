import type { NextRequest } from 'next/server'
import { GET as updatesGET, POST } from '@/modules/updater/server/http'
import { serverGate } from '@/modules/server-panel/server/gate'
export { POST }
export async function GET(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  return updatesGET(req)
}
