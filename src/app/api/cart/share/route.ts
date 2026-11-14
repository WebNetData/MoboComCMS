import type { NextRequest } from 'next/server'
import { GET as readShare, POST as writeShare } from '@/modules/store/server/http/shared-cart'
export const GET = (req: NextRequest) => readShare(req)
export const POST = (req: NextRequest) => writeShare(req)
export const dynamic = 'force-dynamic'
