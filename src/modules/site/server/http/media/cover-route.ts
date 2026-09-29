import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IMAGE_WIDTHS } from '@/shared/media/image'

const NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$/
const typeOf = (name: string) => (name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'image/jpeg')
const headers = (type: string) => ({ 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })

/** GET /api/media/covers/<id>.<ext>[?w=320] — originals, or a cached WebP at an allowed width. */
export async function GET(request: Request, { params: paramsPromise }: { params: Promise<{ file: string }> }) {
  const params = await paramsPromise
  if (!NAME.test(params.file)) return new Response(null, { status: 404 })
  const dir = join(process.cwd(), 'storage', 'covers')
  const width = Number(new URL(request.url).searchParams.get('w'))
  try {
    if (IMAGE_WIDTHS.includes(width as (typeof IMAGE_WIDTHS)[number])) {
      const cached = join(dir, '.cache', `${params.file.replace(/\.\w+$/, '')}-${width}.webp`)
      const hit = await readFile(cached).catch(() => null)
      if (hit) return new Response(hit, { headers: headers('image/webp') })
      const original = await readFile(join(dir, params.file))
      const sharp = (await import('sharp')).default
      const out = await sharp(original, { animated: true }).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
      await mkdir(join(dir, '.cache'), { recursive: true })
      await writeFile(cached, out).catch(() => undefined)
      return new Response(out, { headers: headers('image/webp') })
    }
    const bytes = await readFile(join(dir, params.file))
    return new Response(bytes, { headers: headers(typeOf(params.file)) })
  } catch { return new Response(null, { status: 404 }) }
}
