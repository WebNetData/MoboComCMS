import type { NextRequest } from 'next/server'
import { GET_download } from '@/modules/store/server/http/product-files'
type Context = { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic'
export const GET = async (req: NextRequest, context: Context) => GET_download(req, (await context.params).id)
export const HEAD = GET
