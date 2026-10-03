import { llmsTxt } from '@/modules/seo/server/feeds'

export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(await llmsTxt(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' } })
}
