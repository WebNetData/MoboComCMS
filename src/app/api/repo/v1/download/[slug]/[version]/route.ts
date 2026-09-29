import type { NextRequest } from 'next/server'
import { GET_download } from '@/modules/repository/server/http/public'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; version: string }> }) { const p = await params; return GET_download(req, p.slug, p.version) }
