import { publicTransfer } from '@/modules/media/server/library'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { return publicTransfer((await params).id) }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
