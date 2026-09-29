import { serveMasked } from '@/modules/downloads/server/mask'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ token: string; name: string[] }> }

/** Masked file download/stream on this site's own domain. */
export async function GET(req: Request, context: Context) {
  const { token, name } = await context.params
  return serveMasked(req, token, name)
}

export async function HEAD(req: Request, context: Context) {
  const { token, name } = await context.params
  return serveMasked(req, token, name)
}
