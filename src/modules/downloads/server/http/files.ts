import { AUTHOR_PERMISSIONS } from '@/modules/identity/domain/sections'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { getSettings } from '@/modules/settings/server'
import { findAssets, rewriteAssets } from '@/modules/downloads/domain/localize'
import { FileError, appendChunk, cancelUpload, finishUpload, importFile, importImage, logImportFailure, pruneUploads, serveLocalFile, startUpload } from '@/modules/downloads/server/files'

// Staff who edit content in any section may upload files and copy pasted assets.
// A section author uploads what their own items need, like the section's manager.
const CONTENT_PERMS = ['cms.posts', 'cms.pages', 'cms.products', 'music.manage', 'cinema.manage', 'software.manage', 'games.manage', 'settings.manage', ...AUTHOR_PERMISSIONS]

async function staff(req: NextRequest) {
  for (const perm of CONTENT_PERMS) {
    const admin = await requirePerm(req, perm).catch(() => null)
    if (admin) return admin
  }
  return null
}

function failure(error: unknown) {
  if (error instanceof FileError) return err(error.message, error.status)
  console.error('[files]', error)
  return err('انجام نشد؛ دوباره تلاش کنید', 500)
}

/** POST /api/admin/uploads {op:'start', name, size, section} | {op:'finish', id} | {op:'cancel', id} */
export async function POST_upload(req: NextRequest) {
  const admin = await staff(req)
  if (!admin) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.op === 'start') { void pruneUploads().catch(() => undefined); return ok(await startUpload(body)) }
    if (body.op === 'finish') {
      const file = await finishUpload(body.id)
      await auditAdmin({ req, actor: admin, action: 'files.upload', targetType: 'file', targetId: file.path, metadata: { size: file.size } })
      return ok(file)
    }
    if (body.op === 'cancel') { await cancelUpload(body.id); return ok({ cancelled: true }) }
    return err('عملیات نامعتبر است')
  } catch (error) { return failure(error) }
}

/** PUT /api/admin/uploads?id=&offset= — raw chunk body (up to 64 MB). */
export async function PUT_upload(req: NextRequest) {
  if (!await staff(req)) return err('forbidden', 403)
  try { return ok(await appendChunk(req.nextUrl.searchParams.get('id'), req.nextUrl.searchParams.get('offset'), req.body)) } catch (error) { return failure(error) }
}

async function siteHost(req: NextRequest) {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  try { return new URL(settings.siteUrl || process.env.NEXTAUTH_URL || req.nextUrl.origin).hostname } catch { return req.nextUrl.hostname }
}

async function importData(dataUrl: string) {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl)
  if (!match) throw new FileError('تصویر درون‌خطی معتبر نیست')
  const buffer = Buffer.from(match[1], 'base64')
  if (buffer.length > 15 * 1024 * 1024) throw new FileError('تصویر بیش از حد بزرگ است', 413)
  const sharp = (await import('sharp')).default
  const out = await sharp(buffer, { animated: true }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  const file = `${randomUUID()}.webp`
  const dir = path.join(process.cwd(), 'storage', 'covers')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, file), out, { flag: 'wx' })
  return `/api/media/covers/${file}`
}

/**
 * POST /api/admin/content/localize
 *   {html, section?}  → copies external images/files of pasted content to this server and rewrites it
 *   {url, kind}       → one image (cover fields) or file
 */
export async function POST_localize(req: NextRequest) {
  const admin = await staff(req)
  if (!admin) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) || {}
  const section = typeof body.section === 'string' ? body.section : 'posts'
  try {
    if (typeof body.url === 'string') {
      const url = body.url.trim()
      const local = url.startsWith('data:') ? await importData(url) : body.kind === 'file' ? await importFile(url, section) : await importImage(url)
      await auditAdmin({ req, actor: admin, action: 'content.localize', targetType: 'file', targetId: local, metadata: { from: url.slice(0, 300) } })
      return ok({ url: local })
    }
    const html = typeof body.html === 'string' ? body.html : ''
    if (html.length > 3_000_000) return err('محتوا بیش از حد بزرگ است', 413)
    const assets = findAssets(html, await siteHost(req))
    const replacements = new Map<string, string>()
    const failed: string[] = []
    // Images a few at a time; files one by one (they can be large).
    const images = assets.filter((asset) => asset.kind === 'image')
    for (let i = 0; i < images.length; i += 4) {
      await Promise.all(images.slice(i, i + 4).map(async (asset) => {
        try { replacements.set(asset.url, asset.url.startsWith('data:') ? await importData(asset.url) : await importImage(asset.url)) } catch (error) { failed.push(asset.url.slice(0, 200)); logImportFailure(asset.url, error) }
      }))
    }
    for (const asset of assets.filter((item) => item.kind === 'file')) {
      try { replacements.set(asset.url, await importFile(asset.url, section)) } catch (error) { failed.push(asset.url); logImportFailure(asset.url, error) }
    }
    if (replacements.size) await auditAdmin({ req, actor: admin, action: 'content.localize', targetType: 'content', targetId: section, metadata: { copied: replacements.size, failed: failed.length } })
    return ok({ html: rewriteAssets(html, replacements), replacements: [...replacements], copied: replacements.size, images: images.length, files: assets.length - images.length, failed })
  } catch (error) { return failure(error) }
}

/** GET/HEAD /files/<path> */
export async function GET_file(req: Request, context: { params: Promise<{ path: string[] }> }) {
  return serveLocalFile(req, (await context.params).path)
}
