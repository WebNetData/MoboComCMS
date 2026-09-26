import { openTrack } from '@/modules/media/server/links'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return openTrack(request, (await params).id)
}
