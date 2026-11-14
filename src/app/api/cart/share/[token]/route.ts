import type { NextRequest } from 'next/server'
import { GET as readShare, POST as writeShare } from '@/modules/store/server/http/shared-cart'
type Context = { params: Promise<{ token: string }> }
export const GET = (req: NextRequest, context: Context) => readShare(req, context)
export const POST = (req: NextRequest, context: Context) => writeShare(req, context)
export const dynamic = 'force-dynamic'
