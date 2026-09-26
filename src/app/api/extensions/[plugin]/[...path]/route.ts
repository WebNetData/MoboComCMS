import type { NextRequest } from 'next/server'
import { dispatchExtensionApi } from '@/extensions/server/api'

async function dispatch(req: NextRequest, context: { params: Promise<{ plugin: string; path: string[] }> }) {
  const params = await context.params
  return dispatchExtensionApi(req, params.plugin, params.path || [])
}
export const GET = dispatch
export const POST = dispatch
export const PUT = dispatch
export const PATCH = dispatch
export const DELETE = dispatch
