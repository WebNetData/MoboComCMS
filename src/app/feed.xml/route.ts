import { rssFeed } from '@/modules/seo/server/feeds'

export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(await rssFeed(), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } })
}
