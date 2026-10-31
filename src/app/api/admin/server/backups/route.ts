import type { NextRequest } from 'next/server'
import { serverGate } from '@/modules/server-panel/server/gate'
import { GET as read, POST as write } from '@/modules/notifications/server/http/admin/backups/route'
export async function GET(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  return read(req)
}
export async function POST(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  return write(req)
}
