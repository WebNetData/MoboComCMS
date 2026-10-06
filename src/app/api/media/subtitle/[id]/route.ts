import { openSubtitle } from '@/modules/media/server/links'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return openSubtitle(request, (await params).id)
}
