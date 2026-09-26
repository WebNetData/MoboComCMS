import { ImageResponse } from 'next/og'
import { getSeoConfig } from '@/modules/seo/server/config'

export const dynamic = 'force-dynamic'

/** Default 1200×630 share image (PNG — social networks ignore SVG). Content pages use their own cover. */
export async function GET() {
  const seo = await getSeoConfig().catch(() => null)
  const brand = seo?.brandLatin || 'MoboCom'
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px', background: 'linear-gradient(135deg, #1b1537 0%, #2a1b52 55%, #5b36f2 100%)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        <div style={{ width: '120px', height: '120px', borderRadius: '32px', background: 'linear-gradient(135deg, #8b6cff, #e8468f)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '72px', fontWeight: 800 }}>{brand.slice(0, 1).toUpperCase()}</div>
        <div style={{ fontSize: '96px', fontWeight: 800, letterSpacing: '-2px' }}>{brand}</div>
      </div>
      <div style={{ marginTop: '36px', fontSize: '38px', color: '#d9d4f2' }}>Shop · Magazine · Music · Movies · Games · Software · Forum</div>
    </div>,
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400' } },
  )
}
