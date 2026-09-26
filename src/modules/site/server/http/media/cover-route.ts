import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function GET(_request: Request, { params: paramsPromise }: { params: Promise<{ file: string }> }) {
  const params = await paramsPromise
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$/.test(params.file)) return new Response(null, { status: 404 })
  try {
    const bytes = await readFile(join(process.cwd(), 'storage', 'covers', params.file))
    const type = params.file.endsWith('.webp') ? 'image/webp' : params.file.endsWith('.png') ? 'image/png' : 'image/jpeg'
    return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response(null, { status: 404 }) }
}
