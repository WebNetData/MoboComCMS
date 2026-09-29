import type { NextRequest } from 'next/server'
import { POST_license } from '@/modules/repository/server/http/public'

export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) { return POST_license(req, (await params).action) }
