import type { NextRequest } from 'next/server'
import { GET_product } from '@/modules/repository/server/http/public'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) { return GET_product(req, (await params).slug) }
