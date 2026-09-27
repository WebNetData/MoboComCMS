import sharp from 'sharp'
import { getSiteConfig } from '@/modules/site/config/store'
import { siteBase } from '@/modules/site/server/seo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SIZES = new Set([180, 192, 512])

/** A geometric "M" monogram for sites without an uploaded logo (no font needed). */
const monogram = (size: number, inset: number) => {
  const s = size - inset * 2
  const x = (v: number) => (inset + v * s).toFixed(1)
  const path = `M${x(0.2)} ${x(0.74)}V${x(0.28)}l${(s * 0.3).toFixed(1)} ${(s * 0.26).toFixed(1)} ${(s * 0.3).toFixed(1)} -${(s * 0.26).toFixed(1)}V${x(0.74)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#6d4aff"/>
    <path d="${path}" fill="none" stroke="#fff" stroke-width="${(s * 0.11).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
}

/**
 * GET /pwa-icon/192 | /pwa-icon/512[?maskable=1] — the app icon as PNG. Uses the
 * site logo when one is set (padded onto white), otherwise a monogram.
 * Maskable icons keep the artwork inside the 80% safe zone.
 */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size)
  if (!SIZES.has(size)) return new Response('not found', { status: 404 })
  const maskable = new URL(request.url).searchParams.get('maskable') === '1'
  const inset = Math.round(size * (maskable ? 0.2 : 0.12))
  let png: Buffer | null = null
  const site = await getSiteConfig().catch(() => null)
  if (site?.logo) {
    try {
      const base = await siteBase()
      const url = /^https?:\/\//.test(site.logo) ? site.logo : `${base}${site.logo}`
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (response.ok) {
        const logo = await sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 30_000_000 }).resize(size - inset * 2, size - inset * 2, { fit: 'contain', background: '#ffffff' }).png().toBuffer()
        png = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } }).composite([{ input: logo, gravity: 'center' }]).png().toBuffer()
      }
    } catch { png = null }
  }
  png ??= await sharp(Buffer.from(monogram(size, maskable ? inset : Math.round(size * 0.04)))).png().toBuffer()
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } })
}
