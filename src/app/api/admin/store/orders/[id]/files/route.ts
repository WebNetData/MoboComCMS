import type { NextRequest } from 'next/server'
import { GET_admin, POST_admin } from '@/modules/store/server/http/delivery-files'
type Context = { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic'
export const GET = async (req: NextRequest, context: Context) => GET_admin(req, (await context.params).id)
export const POST = async (req: NextRequest, context: Context) => POST_admin(req, (await context.params).id)
