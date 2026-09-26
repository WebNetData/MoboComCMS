import { NextRequest, NextResponse } from 'next/server'
import { contentTypeOf, extensionOf, validPackagePath } from '@/modules/packages/domain/format'
import { fileBuffer, loadPackage } from '@/modules/packages/server/store'

// Only media, fonts and stylesheets are public. Markup, manifests and sources
// stay private; SVG is sandboxed so it can never run script at this origin.
const PUBLIC_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'ico', 'svg', 'woff', 'woff2', 'css'])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: parts } = await params
  const path = (parts || []).join('/')
  if (!validPackagePath(path) || !PUBLIC_EXTENSIONS.has(extensionOf(path))) return new NextResponse('Not found', { status: 404 })
  const pkg = await loadPackage(id)
  if (!pkg || pkg.manifest.runtime !== 'declarative' || (pkg.manifest.kind === 'plugin' && !pkg.enabled)) return new NextResponse('Not found', { status: 404 })
  const data = fileBuffer(pkg, path)
  if (!data) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentTypeOf(path) + (extensionOf(path) === 'css' ? '; charset=utf-8' : ''),
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
