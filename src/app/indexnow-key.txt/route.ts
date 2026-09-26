import { indexNowKey } from '@/modules/seo/server/config'

export const dynamic = 'force-dynamic'

/** IndexNow ownership proof (referenced as keyLocation in every submission). */
export async function GET() {
  return new Response(await indexNowKey(), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
