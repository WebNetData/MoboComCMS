import type { NextRequest } from 'next/server'
import { GET_files, POST_files } from '@/modules/store/server/http/product-files'
type Context = { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic'
export const GET = async (req: NextRequest, context: Context) => GET_files(req, (await context.params).id)
export const POST = async (req: NextRequest, context: Context) => POST_files(req, (await context.params).id)
