import type { NextRequest } from 'next/server'
import { GET_buyer } from '@/modules/store/server/http/delivery-files'
type Context = { params: Promise<{ id: string; fileId: string }> }
export const dynamic = 'force-dynamic'
export const GET = async (req: NextRequest, context: Context) => { const { id, fileId } = await context.params; return GET_buyer(req, id, fileId) }
