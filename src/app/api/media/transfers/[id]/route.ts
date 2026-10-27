import { publicTransfer } from '@/modules/media/server/library'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return publicTransfer((await params).id, new URL(request.url).searchParams.get('w')) }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
